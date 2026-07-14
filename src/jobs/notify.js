import webpush from 'web-push';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { emitToUser } from '../realtime/bus.js';
import { sendEmail } from '../services/messaging.service.js';

/**
 * @file Multi-channel notification helper for background jobs.
 *
 * Persists an in-app row (`notifications`), pushes it over Socket.IO to the
 * recipient's personal channel, and (best-effort) fans it out via Web Push and
 * transactional email. All secondary channels are non-fatal: a failed push or
 * email never rejects the caller, so a reminder/badge job can never be aborted
 * by an unreachable endpoint.
 *
 * @module jobs/notify
 */

let vapidReady = false;
/** Lazily configures Web Push VAPID keys (once). @returns {boolean} */
function ensureVapid() {
  if (vapidReady) return true;
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = config.push;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  vapidReady = true;
  return true;
}

/**
 * Delivers a notification to a single user across every enabled channel.
 *
 * @param {object} params
 * @param {string} params.userId          - Recipient id.
 * @param {string} params.type            - Machine type (e.g. `event_reminder`, `badge`).
 * @param {string} params.title           - Localized title.
 * @param {string} params.message         - Localized body.
 * @param {Record<string, unknown>} [params.data] - Arbitrary payload (event id, url…).
 * @param {boolean} [params.email=false]  - Also send a transactional email.
 * @param {boolean} [params.push=true]    - Also send Web Push.
 * @returns {Promise<void>}
 * @sideeffect Inserts one `notifications` row; emits `notification:new`; may send push/email.
 */
export async function notifyUser({ userId, type, title, message, data = {}, email = false, push = true }) {
  // 1) Durable in-app record (source of truth for the bell dropdown).
  const row = await db.Notification.create({ user_id: userId, type, title, message, data });

  // 2) Realtime nudge to the connected client.
  emitToUser(userId, 'notification:new', {
    id: row.id,
    type,
    title,
    message,
    data,
    created_at: row.created_at,
  });

  // 3) Web Push (best-effort; prune dead subscriptions).
  if (push && ensureVapid()) {
    const subs = await db.PushSubscription.findAll({ where: { user_id: userId } });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body: message, data }),
          );
        } catch (err) {
          // 404/410 → subscription expired: hard-delete it.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.PushSubscription.destroy({ where: { id: s.id } });
          } else {
            logger.warn({ err: err?.message, userId }, 'web-push failed');
          }
        }
      }),
    );
  }

  // 4) Transactional email (opt-in per call).
  if (email) {
    const profile = await db.Profile.findByPk(userId, { attributes: ['email'] });
    if (profile?.email) {
      await sendEmail({ to: profile.email, subject: title, text: message }).catch((err) =>
        logger.warn({ err: err?.message, userId }, 'notification email failed'),
      );
    }
  }
}

export default { notifyUser };
