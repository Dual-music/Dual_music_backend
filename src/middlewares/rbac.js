import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file Role-based (RBAC) and attribute-based (ABAC) authorization middleware.
 *
 * Roles are stored exclusively in the `user_roles` table (never on the user),
 * matching the spec. `requireRole` enforces coarse RBAC; `hasRole` is the
 * reusable predicate; `requireVerifiedPhone` gates actions that need a verified
 * phone; ABAC resource checks (e.g. `canModerate`) live in services and are
 * composed per-route.
 *
 * @module middlewares/rbac
 */

/** @typedef {'fan'|'artist'|'manager'|'moderator'|'admin'} AppRole */

/**
 * Utility predicate: does a user hold a given role? (DB-backed, cache-free.)
 * @param {string} userId
 * @param {AppRole} role
 * @returns {Promise<boolean>}
 */
export async function hasRole(userId, role) {
  const count = await db.UserRole.count({ where: { user_id: userId, role } });
  return count > 0;
}

/**
 * Requires the authenticated principal to hold at least one of the given roles.
 * Must run after {@link authenticate}.
 * @param {...AppRole} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  const middleware = (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('UNAUTHENTICATED'));
    const granted = req.roles || [];
    const ok = roles.some((r) => granted.includes(r));
    if (!ok) return next(ApiError.forbidden('FORBIDDEN', { details: { required: roles } }));
    return next();
  };
  middleware.__roles = roles;
  return middleware;
}

/**
 * Requires the principal's phone to be verified (e.g. for financial actions).
 * @returns {import('express').RequestHandler}
 */
export function requireVerifiedPhone() {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('UNAUTHENTICATED'));
    if (!req.user.phoneVerified) return next(ApiError.forbidden('PHONE_NOT_VERIFIED'));
    return next();
  };
}

/**
 * ABAC helper: may `actor` moderate content owned by `targetUserId`?
 * True for admins/moderators, or when acting on their own content.
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @param {string} targetUserId
 * @returns {boolean}
 */
export function canModerate(actor, actorRoles, targetUserId) {
  if (actorRoles.includes('admin') || actorRoles.includes('moderator')) return true;
  return actor.id === targetUserId;
}

export default requireRole;
