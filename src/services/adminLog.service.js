import { db } from '../models/index.js';

/**
 * @file Admin audit-log writer (shared by moderation & admin modules).
 *
 * Every privileged mutation records an append-only `admin_logs` row so the
 * admin dashboard (`AdminLogs.tsx`) can render an immutable action history.
 * Writing the log must never break the business operation, so failures are
 * swallowed after best-effort insertion.
 *
 * @module services/adminLog.service
 */

/**
 * Appends an admin action to the audit log.
 *
 * @param {object} params
 * @param {string|null} params.adminId    - Acting admin user id (null for system).
 * @param {string} [params.adminName]     - Display name captured at action time.
 * @param {string} params.actionType      - Machine action code (e.g. `ban_user`).
 * @param {string} [params.targetType]    - Target entity type (`user`, `report`…).
 * @param {string} [params.targetId]      - Target entity id.
 * @param {string} [params.targetName]    - Human label for the target.
 * @param {Record<string, unknown>} [params.details] - Arbitrary context payload.
 * @returns {Promise<void>}
 * @sideeffect Inserts one `admin_logs` row.
 */
export async function logAdminAction({
  adminId = null,
  adminName = 'system',
  actionType,
  targetType = null,
  targetId = null,
  targetName = null,
  details = null,
}) {
  try {
    await db.AdminLog.create({
      admin_id: adminId,
      admin_name: adminName,
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      target_name: targetName,
      details,
    });
  } catch {
    // Audit logging is best-effort; never fail the underlying action.
  }
}

export default { logAdminAction };
