import { config } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { hmacHash, randomToken } from '../utils/crypto.js';
import { signAccessToken } from '../utils/jwt.js';

/**
 * @file Token lifecycle service — access JWTs + rotating refresh tokens.
 *
 * Access tokens are short-lived (15 min) JWTs carrying a random `jti` so they
 * can be individually revoked via a Redis blacklist. Refresh tokens are opaque,
 * long-lived (30 d), stored **hashed**, and **rotated on every use**: the old
 * token is revoked and chained (`replaced_by`) to the new one. Presenting an
 * already-revoked refresh token is treated as reuse/theft → all of the user's
 * tokens are revoked.
 *
 * @module services/token.service
 */

/**
 * Parses a duration string like `15m`, `30d`, `12h`, `45s` into seconds.
 * @param {string} value
 * @returns {number}
 */
export function parseDurationSeconds(value) {
  const m = /^(\d+)\s*([smhd])$/.exec(String(value).trim());
  if (!m) return Number(value) || 0;
  const n = Number(m[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}

const ACCESS_TTL_SEC = parseDurationSeconds(config.jwt.accessTtl);
const REFRESH_TTL_SEC = parseDurationSeconds(config.jwt.refreshTtl);

/**
 * @typedef {object} IssuedTokens
 * @property {string} accessToken
 * @property {string} refreshToken - Opaque plaintext (returned to client once).
 * @property {number} expiresIn - Access token lifetime in seconds.
 * @property {string} tokenType - Always `Bearer`.
 */

/**
 * Issues a new access+refresh pair and persists the hashed refresh token.
 * @param {{ id: string }} user
 * @param {object} [ctx]
 * @param {string} [ctx.userAgent]
 * @param {string} [ctx.ip]
 * @param {import('sequelize').Transaction} [ctx.transaction]
 * @returns {Promise<IssuedTokens>}
 */
export async function issueTokens(user, { userAgent, ip, transaction } = {}) {
  const jti = randomToken(16);
  const accessToken = signAccessToken({ sub: user.id, jti });
  const refreshToken = randomToken(48);
  await db.RefreshToken.create(
    {
      user_id: user.id,
      token_hash: hmacHash(refreshToken),
      expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      user_agent: userAgent?.slice(0, 255) ?? null,
      ip: ip?.slice(0, 45) ?? null,
    },
    { transaction },
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC, tokenType: 'Bearer' };
}

/**
 * Rotates a refresh token: validates it, revokes it, and issues a new pair.
 * @param {string} refreshToken - Opaque plaintext presented by the client.
 * @param {object} [ctx]
 * @param {string} [ctx.userAgent]
 * @param {string} [ctx.ip]
 * @returns {Promise<IssuedTokens & { user: any }>}
 * @throws {ApiError} 401 on invalid/expired/reused tokens or banned user.
 */
export async function rotateRefreshToken(refreshToken, ctx = {}) {
  const tokenHash = hmacHash(refreshToken);
  return db.sequelize.transaction(async (transaction) => {
    const row = await db.RefreshToken.findOne({ where: { token_hash: tokenHash }, transaction });
    if (!row) throw ApiError.unauthorized('INVALID_TOKEN');

    if (row.revoked_at) {
      // Reuse of a revoked token ⇒ probable theft: revoke the whole family.
      await revokeAllForUser(row.user_id, transaction);
      throw ApiError.unauthorized('INVALID_TOKEN');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) throw ApiError.unauthorized('INVALID_TOKEN');

    const user = await db.User.findByPk(row.user_id, { transaction });
    if (!user) throw ApiError.unauthorized('INVALID_TOKEN');
    if (user.is_banned) throw ApiError.forbidden('ACCOUNT_BANNED');

    const next = await issueTokens(user, { ...ctx, transaction });
    const replacement = await db.RefreshToken.findOne({
      where: { token_hash: hmacHash(next.refreshToken) },
      transaction,
    });
    row.revoked_at = new Date();
    row.replaced_by = replacement?.id ?? null;
    await row.save({ transaction });

    return { ...next, user };
  });
}

/**
 * Revokes a single refresh token (idempotent) — used on logout.
 * @param {string} refreshToken
 * @returns {Promise<void>}
 */
export async function revokeRefreshToken(refreshToken) {
  await db.RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash: hmacHash(refreshToken), revoked_at: null } },
  );
}

/**
 * Revokes every active refresh token for a user.
 * @param {string} userId
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<void>}
 */
export async function revokeAllForUser(userId, transaction) {
  await db.RefreshToken.update(
    { revoked_at: new Date() },
    { where: { user_id: userId, revoked_at: null }, transaction },
  );
}

/**
 * Blacklists an access token by `jti` until its natural expiry (best-effort;
 * requires Redis). Used on logout so a still-valid access token is rejected.
 * @param {string} jti
 * @param {number} [exp] - JWT `exp` claim (epoch seconds).
 * @returns {Promise<void>}
 */
export async function blacklistAccessToken(jti, exp) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready' || !jti) return;
  const ttl = Math.max(1, (exp || Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC) - Math.floor(Date.now() / 1000));
  await redis.set(`revoked:${jti}`, '1', 'EX', ttl);
}

export default { issueTokens, rotateRefreshToken, revokeRefreshToken, revokeAllForUser, blacklistAccessToken };
