import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { db } from '../src/models/index.js';

/**
 * @file Auth module integration tests (SQLite in-memory).
 *
 * Exercises the real HTTP surface end-to-end: registration side effects
 * (profile + fan role + wallet credited with welcome credits + referral),
 * login, token refresh/rotation, `/me`, password change, and error paths.
 */

const app = createApp();
const api = () => request(app);

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  // Seed welcome-credit setting (normally provided by the seeder).
  await db.PlatformSetting.create({ key: 'welcome_config', value: { welcome_credits: 100 } });
});

afterAll(async () => {
  await db.sequelize.close();
});

const validUser = {
  email: 'alice@example.com',
  password: 'Sup3rSecret!',
  fullName: 'Alice Test',
  phone: '+33612345678',
  countryCode: 'FR',
  phoneCountryCode: '+33',
};

describe('POST /api/v1/auth/register', () => {
  it('registers a user and provisions profile, fan role and a credited wallet', async () => {
    const res = await api().post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.roles).toContain('fan');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.meta.requestId).toBeTruthy();

    const wallet = await db.UserWallet.findByPk(res.body.data.user.id);
    expect(Number(wallet.balance)).toBe(100);

    const profile = await db.Profile.findByPk(res.body.data.user.id);
    expect(profile.referral_code).toMatch(/^REF-[0-9A-F]{8}$/);

    // Password hash must never be exposed.
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await api().post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_USED');
  });

  it('rejects an invalid body with 422', async () => {
    const res = await api().post('/api/v1/auth/register').send({ email: 'nope', password: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('records a referral when a valid referral code is supplied', async () => {
    const referrer = await db.Profile.findByPk((await db.User.findOne({ where: { email: 'alice@example.com' } })).id);
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'bob@example.com', password: 'An0therPass!', fullName: 'Bob', referralCode: referrer.referral_code });
    expect(res.status).toBe(201);
    const referral = await db.Referral.findOne({ where: { referred_id: res.body.data.user.id } });
    expect(referral).not.toBeNull();
    expect(referral.referrer_id).toBe(referrer.id);
    const notif = await db.Notification.findOne({ where: { user_id: referrer.id, type: 'referral' } });
    expect(notif).not.toBeNull();
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in with valid credentials', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rejects wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: validUser.email, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/v1/auth/me + refresh + password change', () => {
  /** @type {{ accessToken: string, refreshToken: string, userId: string }} */
  let session;

  beforeAll(async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: validUser.email, password: validUser.password });
    session = {
      accessToken: res.body.data.accessToken,
      refreshToken: res.body.data.refreshToken,
      userId: res.body.data.user.id,
    };
  });

  it('returns the principal, profile and roles from /me', async () => {
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(session.userId);
    expect(res.body.data.profile.full_name).toBe('Alice Test');
    expect(res.body.data.roles).toContain('fan');
  });

  it('rejects /me without a token (401)', async () => {
    const res = await api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(session.refreshToken);

    // Old refresh token must now be rejected (rotation + reuse detection).
    const reuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(reuse.status).toBe(401);

    session.refreshToken = res.body.data.refreshToken;
    session.accessToken = res.body.data.accessToken;
  });

  it('changes the password and blocks the old one', async () => {
    const change = await api()
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: validUser.password, newPassword: 'BrandN3wPass!' });
    expect(change.status).toBe(200);

    const oldLogin = await api().post('/api/v1/auth/login').send({ email: validUser.email, password: validUser.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api().post('/api/v1/auth/login').send({ email: validUser.email, password: 'BrandN3wPass!' });
    expect(newLogin.status).toBe(200);
  });
});
