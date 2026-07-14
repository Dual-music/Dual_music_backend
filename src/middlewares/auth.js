import { getRedis } from '../config/redis.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * @file Authentication middleware.
 *
 * Extracts the Bearer access token, verifies its signature/expiry, checks the
 * Redis revocation blacklist (by token id `jti`), loads the user + roles, and
 * attaches `req.user` (id, email, phone_verified, is_banned) and `req.roles`
 * (string[]) for downstream RBAC/ABAC checks.
 *
 * @module middlewares/auth
 */

/**
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {boolean} phoneVerified
 * @property {boolean} isBanned
 */

/**
 * Reads the Bearer token from the Authorization header.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractBearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Resolves the authenticated user from a verified token payload.
 * @param {{ sub: string, jti?: string }} payload
 * @returns {Promise<{ user: AuthUser, roles: string[] }>}
 */
async function loadPrincipal(payload) {
  const redis = getRedis();
  if (redis && redis.status === 'ready' && payload.jti) {
    const revoked = await redis.get(`revoked:${payload.jti}`);
    if (revoked) throw ApiError.unauthorized('INVALID_TOKEN');
  }

  const user = await db.User.findByPk(payload.sub, {
    attributes: ['id', 'email', 'phone_verified', 'is_banned'],
    include: [{ model: db.UserRole, as: 'roles', attributes: ['role'] }],
  });
  if (!user) throw ApiError.unauthorized('INVALID_TOKEN');
  if (user.is_banned) throw ApiError.forbidden('ACCOUNT_BANNED');

  return {
    user: {
      id: user.id,
      email: user.email,
      phoneVerified: user.phone_verified,
      isBanned: user.is_banned,
    },
    roles: (user.roles || []).map((r) => r.role),
  };
}

/**
 * Requires a valid access token. Rejects with 401 otherwise.
 * @returns {import('express').RequestHandler}
 */
export function authenticate() {
  const middleware = async (req, _res, next) => {
    const token = extractBearer(req);
    if (!token) return next(ApiError.unauthorized('UNAUTHENTICATED'));
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return next(ApiError.unauthorized('INVALID_TOKEN'));
    }
    const { user, roles } = await loadPrincipal(payload);
    req.user = user;
    req.roles = roles;
    req.tokenPayload = payload;
    return next();
  };
  middleware.__auth = 'required';
  return middleware;
}

/**
 * Attaches the principal when a valid token is present, but never rejects.
 * Useful for endpoints with public + enriched-authenticated behavior.
 * @returns {import('express').RequestHandler}
 */
export function optionalAuth() {
  const middleware = async (req, _res, next) => {
    const token = extractBearer(req);
    if (!token) return next();
    try {
      const payload = verifyToken(token);
      const { user, roles } = await loadPrincipal(payload);
      req.user = user;
      req.roles = roles;
      req.tokenPayload = payload;
    } catch {
      /* ignore — treat as anonymous */
    }
    return next();
  };
  middleware.__auth = 'optional';
  return middleware;
}

export default authenticate;
