import { config } from '../config/env.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

import { provisionUserRecords, serializeUser } from './auth.service.js';
import { issueTokens } from './token.service.js';

/**
 * @file Google OAuth 2.0 (Authorization Code) service.
 *
 * Reproduces the frontend's Google sign-in. `buildGoogleAuthUrl` returns the
 * consent URL; `handleGoogleCallback` exchanges the code, resolves/links the
 * user (by linked OAuth account, then by email, else provisions a new verified
 * account), and issues our own JWT pair. Uses the global `fetch` (Node 20).
 *
 * @module services/oauth.service
 */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Builds the Google consent URL.
 * @param {string} state - CSRF/anti-forgery state echoed back on callback.
 * @returns {string}
 */
export function buildGoogleAuthUrl(state) {
  if (!config.google.clientId) throw ApiError.internal('OAUTH_NOT_CONFIGURED');
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for the Google profile.
 * @param {string} code
 * @returns {Promise<{ sub: string, email: string, name?: string, email_verified?: boolean }>}
 */
async function exchangeCode(code) {
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw ApiError.unauthorized('INVALID_TOKEN', { details: { provider: 'google' } });
  const { access_token: accessToken } = await tokenRes.json();

  const userRes = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!userRes.ok) throw ApiError.unauthorized('INVALID_TOKEN', { details: { provider: 'google' } });
  return userRes.json();
}

/**
 * Handles the OAuth callback: resolve/link/provision the user, then issue tokens.
 * @param {string} code
 * @param {object} [ctx] - { userAgent, ip }.
 * @returns {Promise<{ user: object } & import('./token.service.js').IssuedTokens>}
 */
export async function handleGoogleCallback(code, ctx = {}) {
  const profile = await exchangeCode(code);
  const email = profile.email?.trim().toLowerCase();
  if (!email) throw ApiError.unauthorized('INVALID_TOKEN');

  const user = await db.sequelize.transaction(async (tx) => {
    // 1. Already linked?
    const link = await db.OAuthAccount.findOne({
      where: { provider: 'google', provider_account_id: profile.sub },
      transaction: tx,
    });
    if (link) return db.User.findByPk(link.user_id, { transaction: tx });

    // 2. Existing user by email → link.
    let account = await db.User.findOne({ where: { email }, transaction: tx });
    if (!account) {
      // 3. Provision a new, email-verified account (no password).
      account = await db.User.create({ email, email_verified: true }, { transaction: tx });
      await provisionUserRecords(tx, account, { fullName: profile.name, countryCode: 'FR' });
    }
    await db.OAuthAccount.create(
      { user_id: account.id, provider: 'google', provider_account_id: profile.sub },
      { transaction: tx },
    );
    return account;
  });

  if (user.is_banned) throw ApiError.forbidden('ACCOUNT_BANNED');
  const tokens = await issueTokens(user, ctx);
  return { user: serializeUser(user), ...tokens };
}

const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

/**
 * Vérifie un ID token Google (émis côté app par Credential Manager) et renvoie le profil.
 *
 * Contrôles : émetteur `accounts.google.com`, audience ∈ `config.google.allowedAudiences`
 * (le **Web client ID** Firebase passé comme `serverClientId` par l'app), présence de l'email.
 *
 * @param {string} idToken
 * @returns {Promise<{ email: string, sub: string, name?: string }>}
 */
async function verifyGoogleIdToken(idToken) {
  const audiences = config.google.allowedAudiences;
  if (!audiences.length) throw ApiError.internal('OAUTH_NOT_CONFIGURED');

  const res = await fetch(`${GOOGLE_TOKENINFO}?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw ApiError.unauthorized('INVALID_TOKEN');
  const claims = await res.json().catch(() => ({}));

  const iss = claims.iss || '';
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    throw ApiError.unauthorized('INVALID_TOKEN');
  }
  if (!audiences.includes(claims.aud)) throw ApiError.unauthorized('INVALID_TOKEN');
  if (!claims.email) throw ApiError.unauthorized('INVALID_TOKEN');

  return { email: claims.email, sub: claims.sub, name: claims.name };
}

/**
 * Connexion Google **native** : vérifie l'ID token, résout/lie/provisionne le compte
 * (même logique que le callback web), puis émet notre paire de JWT.
 *
 * @param {string} idToken - ID token Google fourni par l'app.
 * @param {object} [ctx] - Contexte de requête (IP/UA) pour l'émission des tokens.
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
 */
export async function handleGoogleIdToken(idToken, ctx = {}) {
  const profile = await verifyGoogleIdToken(idToken);
  const email = profile.email.trim().toLowerCase();

  const user = await db.sequelize.transaction(async (tx) => {
    const link = await db.OAuthAccount.findOne({
      where: { provider: 'google', provider_account_id: profile.sub },
      transaction: tx,
    });
    if (link) return db.User.findByPk(link.user_id, { transaction: tx });

    let account = await db.User.findOne({ where: { email }, transaction: tx });
    if (!account) {
      account = await db.User.create({ email, email_verified: true }, { transaction: tx });
      await provisionUserRecords(tx, account, { fullName: profile.name, countryCode: 'FR' });
    }
    await db.OAuthAccount.create(
      { user_id: account.id, provider: 'google', provider_account_id: profile.sub },
      { transaction: tx },
    );
    return account;
  });

  if (user.is_banned) throw ApiError.forbidden('ACCOUNT_BANNED');
  const tokens = await issueTokens(user, ctx);
  return { user: serializeUser(user), ...tokens };
}

export default { buildGoogleAuthUrl, handleGoogleCallback, handleGoogleIdToken };
