import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';

/**
 * @file Notifications domain service — the in-app inbox plus per-user delivery
 * preferences (email + Web Push). Outbound multi-channel *sending* lives in
 * `jobs/notify.js` (`notifyUser`); this service owns reads, read-state, and
 * subscription/preferences management.
 *
 * @module services/notification.service
 */

/** Email preference columns (all boolean, default true). */
const EMAIL_PREF_KEYS = [
  'email_assignments',
  'email_concerts',
  'email_duels',
  'email_gifts',
  'email_lives',
  'email_requests',
  'email_system',
  'email_votes',
];

/**
 * Lists a user's notifications (newest first), optionally filtered by read-state.
 * @param {string} userId
 * @param {object} query - `read?` ('true'|'false') + pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listNotifications(userId, query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  where.user_id = userId;
  if (query.read === 'true') where.read = true;
  if (query.read === 'false') where.read = false;
  const rows = await db.Notification.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns the count of unread notifications (for the bell badge).
 * @param {string} userId
 * @returns {Promise<{ unread: number }>}
 */
export async function unreadCount(userId) {
  const unread = await db.Notification.count({ where: { user_id: userId, read: false } });
  return { unread };
}

/**
 * Marks one notification as read (owner-scoped).
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found for this user.
 */
export async function markRead(userId, id) {
  const row = await db.Notification.findOne({ where: { id, user_id: userId } });
  if (!row) throw ApiError.notFound('NOT_FOUND');
  if (!row.read) {
    row.read = true;
    await row.save();
  }
  return row;
}

/**
 * Marks all of a user's notifications as read.
 * @param {string} userId
 * @returns {Promise<{ updated: number }>}
 */
export async function markAllRead(userId) {
  const [updated] = await db.Notification.update(
    { read: true },
    { where: { user_id: userId, read: false } },
  );
  return { updated };
}

/**
 * Deletes a notification (owner-scoped).
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function remove(userId, id) {
  const deleted = await db.Notification.destroy({ where: { id, user_id: userId } });
  return { removed: deleted > 0 };
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns a user's delivery preferences (email flags), creating defaults on
 * first access so the client always renders a complete toggle set.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getEmailPreferences(userId) {
  const [pref] = await db.EmailNotificationPreference.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId },
  });
  return pref;
}

/**
 * Updates a user's email notification preferences (whitelisted keys only —
 * mass-assignment safe).
 * @param {string} userId
 * @param {Record<string, boolean>} patch
 * @returns {Promise<object>}
 */
export async function updateEmailPreferences(userId, patch) {
  const pref = await getEmailPreferences(userId);
  for (const key of EMAIL_PREF_KEYS) {
    if (typeof patch[key] === 'boolean') pref[key] = patch[key];
  }
  await pref.save();
  return pref;
}

/**
 * Registers (idempotent upsert) a Web Push subscription for a user. Keyed by
 * `endpoint` so re-subscribing the same browser never duplicates rows.
 * @param {string} userId
 * @param {{ endpoint: string, p256dh: string, auth: string }} sub
 * @returns {Promise<object>}
 */
export async function subscribePush(userId, sub) {
  const existing = await db.PushSubscription.findOne({ where: { endpoint: sub.endpoint } });
  if (existing) {
    existing.user_id = userId;
    existing.p256dh = sub.p256dh;
    existing.auth = sub.auth;
    await existing.save();
    return existing;
  }
  return db.PushSubscription.create({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
  });
}

/**
 * Removes a Web Push subscription by endpoint (owner-scoped).
 * @param {string} userId
 * @param {string} endpoint
 * @returns {Promise<{ removed: boolean }>}
 */
export async function unsubscribePush(userId, endpoint) {
  const deleted = await db.PushSubscription.destroy({ where: { user_id: userId, endpoint } });
  return { removed: deleted > 0 };
}

/**
 * Enregistre (upsert) un jeton d'appareil FCM (mobile) pour le push.
 * Réutilise la table `push_subscriptions` : le jeton est stocké dans `endpoint`, avec
 * `p256dh='fcm'` comme marqueur (distinguer FCM des abonnements Web Push).
 *
 * @param {string} userId
 * @param {string} token Jeton FCM de l'appareil.
 * @returns {Promise<{ registered: boolean }>}
 */
export async function registerFcmToken(userId, token) {
  const existing = await db.PushSubscription.findOne({ where: { endpoint: token } });
  if (existing) {
    existing.user_id = userId;
    existing.p256dh = 'fcm';
    existing.auth = 'fcm';
    await existing.save();
  } else {
    await db.PushSubscription.create({ user_id: userId, endpoint: token, p256dh: 'fcm', auth: 'fcm' });
  }
  return { registered: true };
}

/** Supprime un jeton FCM (déconnexion / désinscription). */
export async function unregisterFcmToken(userId, token) {
  const deleted = await db.PushSubscription.destroy({ where: { user_id: userId, endpoint: token } });
  return { removed: deleted > 0 };
}

export default {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  remove,
  getEmailPreferences,
  updateEmailPreferences,
  subscribePush,
  unsubscribePush,
  registerFcmToken,
  unregisterFcmToken,
};
