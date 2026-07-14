import { randomBytes } from 'node:crypto';

import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

import { sendEmail } from './messaging.service.js';
import { sendOtp, verifyOtp } from './otp.service.js';
import {
  blacklistAccessToken,
  issueTokens,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from './token.service.js';

/**
 * @file Authentication domain service.
 *
 * Owns the full identity lifecycle and faithfully reproduces the side effects of
 * the frontend's former Supabase signup trigger (`handle_new_user` +
 * `handle_referral_on_profile` + `create_referral_entry`): on registration a
 * user gets a profile (with a unique `REF-xxxxxxxx` code), the default `fan`
 * role, a wallet credited with the configured welcome credits, and — when they
 * used a referral code — a `referrals` row plus a notification to the referrer.
 *
 * @module services/auth.service
 */

const DEFAULT_WELCOME_CREDITS = 100;

/**
 * Serializes a User model instance into a safe public shape (never leaks the
 * password hash).
 * @param {any} user
 * @returns {{ id: string, email: string, phone: string|null, phoneVerified: boolean, emailVerified: boolean, isBanned: boolean }}
 */
function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone ?? null,
    phoneVerified: user.phone_verified,
    emailVerified: user.email_verified,
    isBanned: user.is_banned,
  };
}

/**
 * Generates a referral code (`REF-` + 8 uppercase hex) unique across profiles,
 * mirroring the original Postgres `generate_referral_code()`.
 * @param {import('sequelize').Transaction} transaction
 * @returns {Promise<string>}
 */
async function generateReferralCode(transaction) {
  // Bounded retry loop to guarantee uniqueness without a DB function.
  for (let i = 0; i < 10; i += 1) {
    const code = `REF-${randomBytes(4).toString('hex').toUpperCase()}`;
    const exists = await db.Profile.findOne({ where: { referral_code: code }, transaction });
    if (!exists) return code;
  }
  throw ApiError.internal();
}

/**
 * Reads the configured welcome-credit grant from `platform_settings`.
 * @param {import('sequelize').Transaction} transaction
 * @returns {Promise<number>}
 */
async function getWelcomeCredits(transaction) {
  const row = await db.PlatformSetting.findByPk('welcome_config', { transaction });
  const value = row?.value ?? {};
  const n = Number(value.welcome_credits);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WELCOME_CREDITS;
}

/**
 * Provisions the profile/role/wallet/referral records for a freshly created
 * user (shared by password and OAuth registration).
 * @param {import('sequelize').Transaction} tx
 * @param {any} user - The created User instance.
 * @param {object} meta
 * @param {string} [meta.fullName]
 * @param {string} [meta.countryCode]
 * @param {string} [meta.phoneCountryCode]
 * @param {string|null} [meta.referrerId]
 * @returns {Promise<void>}
 */
async function provisionUserRecords(tx, user, { fullName, countryCode, phoneCountryCode, referrerId = null }) {
  const referralCode = await generateReferralCode(tx);

  await db.Profile.create(
    {
      id: user.id,
      email: user.email,
      full_name: fullName || user.email,
      phone: user.phone ?? null,
      country_code: countryCode || 'FR',
      phone_country_code: phoneCountryCode || user.phone_country_code || '+33',
      referred_by: referrerId,
      referral_code: referralCode,
      is_public: false,
    },
    { transaction: tx },
  );

  await db.UserRole.create({ user_id: user.id, role: 'fan' }, { transaction: tx });

  const welcomeCredits = await getWelcomeCredits(tx);
  await db.UserWallet.create({ user_id: user.id, balance: welcomeCredits }, { transaction: tx });

  if (referrerId) {
    const referrer = await db.Profile.findByPk(referrerId, { transaction: tx });
    if (referrer) {
      const existing = await db.Referral.findOne({ where: { referred_id: user.id }, transaction: tx });
      if (!existing) {
        await db.Referral.create(
          {
            referrer_id: referrerId,
            referred_id: user.id,
            referral_code: referrer.referral_code,
            status: 'completed',
          },
          { transaction: tx },
        );
        await db.Notification.create(
          {
            user_id: referrerId,
            type: 'referral',
            title: 'Nouveau filleul !',
            message: `${fullName || 'Un nouvel utilisateur'} s'est inscrit via votre lien de parrainage`,
            data: { referred_id: user.id },
          },
          { transaction: tx },
        );
      }
    }
  }
}

/**
 * Registers a new user with email + password.
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.password
 * @param {string} [input.fullName]
 * @param {string} [input.phone] - Full E.164 (dial + number), as sent by the frontend.
 * @param {string} [input.countryCode]
 * @param {string} [input.phoneCountryCode]
 * @param {string} [input.referralCode]
 * @param {object} [ctx] - { userAgent, ip }.
 * @returns {Promise<{ user: object, profile: object, roles: string[] } & import('./token.service.js').IssuedTokens>}
 */
export async function register(input, ctx = {}) {
  const email = input.email.trim().toLowerCase();

  const existing = await db.User.findOne({ where: { email } });
  if (existing) throw ApiError.conflict('EMAIL_ALREADY_USED');

  const passwordHash = await hashPassword(input.password);

  const user = await db.sequelize.transaction(async (tx) => {
    let referrerId = null;
    if (input.referralCode) {
      const referrer = await db.Profile.findOne({
        where: { referral_code: input.referralCode.trim() },
        transaction: tx,
      });
      referrerId = referrer?.id ?? null;
    }

    const created = await db.User.create(
      {
        email,
        password_hash: passwordHash,
        phone: input.phone ?? null,
        phone_country_code: input.phoneCountryCode ?? '+33',
      },
      { transaction: tx },
    );

    await provisionUserRecords(tx, created, {
      fullName: input.fullName,
      countryCode: input.countryCode,
      phoneCountryCode: input.phoneCountryCode,
      referrerId,
    });
    return created;
  });

  // Post-commit, best-effort side effects (never block/rollback registration).
  if (user.phone) {
    sendOtp({ userId: user.id, channel: 'sms', destination: user.phone, purpose: 'phone_verify' }).catch((err) =>
      logger.warn({ err: err.message }, 'Failed to send signup OTP'),
    );
  }
  sendEmail({
    to: email,
    subject: 'Bienvenue sur Dual Music 🎵',
    html: `<p>Bienvenue ${input.fullName || ''} ! Votre compte Dual Music est prêt.</p>`,
  }).catch(() => {});

  const tokens = await issueTokens(user, ctx);
  const profile = await db.Profile.findByPk(user.id);
  return { user: serializeUser(user), profile, roles: ['fan'], ...tokens };
}

/**
 * Authenticates a user with email + password.
 * @param {{ email: string, password: string }} input
 * @param {object} [ctx]
 * @returns {Promise<{ user: object } & import('./token.service.js').IssuedTokens>}
 */
export async function login(input, ctx = {}) {
  const email = input.email.trim().toLowerCase();
  const user = await db.User.scope('withSecret').findOne({ where: { email } });
  const ok = await verifyPassword(input.password, user?.password_hash);
  if (!user || !ok) throw ApiError.unauthorized('INVALID_CREDENTIALS');
  if (user.is_banned) throw ApiError.forbidden('ACCOUNT_BANNED');

  user.last_login_at = new Date();
  await user.save();

  const tokens = await issueTokens(user, ctx);
  return { user: serializeUser(user), ...tokens };
}

/**
 * Rotates a refresh token, returning a fresh pair.
 * @param {string} refreshToken
 * @param {object} [ctx]
 * @returns {Promise<{ user: object } & import('./token.service.js').IssuedTokens>}
 */
export async function refresh(refreshToken, ctx = {}) {
  const { user, ...tokens } = await rotateRefreshToken(refreshToken, ctx);
  return { user: serializeUser(user), ...tokens };
}

/**
 * Logs a user out: revokes the presented refresh token and blacklists the
 * current access token by `jti`.
 * @param {object} params
 * @param {string} [params.refreshToken]
 * @param {string} [params.jti]
 * @param {number} [params.exp]
 * @returns {Promise<void>}
 */
export async function logout({ refreshToken, jti, exp }) {
  if (refreshToken) await revokeRefreshToken(refreshToken);
  if (jti) await blacklistAccessToken(jti, exp);
}

/**
 * Returns the authenticated principal's account, profile and roles.
 * @param {string} userId
 * @returns {Promise<{ user: object, profile: object|null, roles: string[] }>}
 */
export async function me(userId) {
  const user = await db.User.findByPk(userId, {
    include: [{ model: db.UserRole, as: 'roles', attributes: ['role'] }],
  });
  if (!user) throw ApiError.notFound('NOT_FOUND');
  const profile = await db.Profile.findByPk(userId);
  return { user: serializeUser(user), profile, roles: (user.roles || []).map((r) => r.role) };
}

/**
 * Sends (or resends) a phone-verification OTP to the user's phone.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function requestPhoneOtp(userId) {
  const user = await db.User.findByPk(userId);
  if (!user?.phone) throw ApiError.badRequest('BAD_REQUEST', { details: { phone: 'missing' } });
  await sendOtp({ userId, channel: 'sms', destination: user.phone, purpose: 'phone_verify' });
}

/**
 * Verifies a phone OTP and marks the user's phone as verified.
 * @param {string} userId
 * @param {string} code
 * @returns {Promise<void>}
 */
export async function verifyPhoneOtp(userId, code) {
  const user = await db.User.findByPk(userId);
  if (!user?.phone) throw ApiError.badRequest('BAD_REQUEST');
  await verifyOtp({ destination: user.phone, code, purpose: 'phone_verify' });
  user.phone_verified = true;
  await user.save();
}

/**
 * Initiates a password reset by emailing a one-time code. Always resolves
 * (never reveals whether the email exists).
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function forgotPassword(email) {
  const normalized = email.trim().toLowerCase();
  const user = await db.User.findOne({ where: { email: normalized } });
  if (user) {
    await sendOtp({ userId: user.id, channel: 'email', destination: normalized, purpose: 'password_reset' }).catch(
      (err) => logger.warn({ err: err.message }, 'Failed to send reset OTP'),
    );
  }
}

/**
 * Completes a password reset with the emailed code.
 * @param {{ email: string, code: string, newPassword: string }} input
 * @returns {Promise<void>}
 */
export async function resetPassword({ email, code, newPassword }) {
  const normalized = email.trim().toLowerCase();
  await verifyOtp({ destination: normalized, code, purpose: 'password_reset' });
  const user = await db.User.findOne({ where: { email: normalized } });
  if (!user) throw ApiError.badRequest('OTP_INVALID');
  user.password_hash = await hashPassword(newPassword);
  await user.save();
  await revokeAllForUser(user.id); // force re-login everywhere
}

/**
 * Changes the password of an authenticated user.
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await db.User.scope('withSecret').findByPk(userId);
  if (!user) throw ApiError.notFound('NOT_FOUND');
  // OAuth-only accounts (no password) may set one without the current check.
  if (user.password_hash) {
    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) throw ApiError.badRequest('INVALID_CREDENTIALS');
  }
  user.password_hash = await hashPassword(newPassword);
  await user.save();
}

export { serializeUser, provisionUserRecords };
export default {
  register,
  login,
  refresh,
  logout,
  me,
  requestPhoneOtp,
  verifyPhoneOtp,
  forgotPassword,
  resetPassword,
  changePassword,
};
