import webpush from 'web-push';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { emitToUser } from '../realtime/bus.js';
import { sendEmail } from '../services/messaging.service.js';
import { sendPush } from '../services/push.service.js';

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

  // 3) Push (best-effort). Les jetons FCM (mobile) sont stockés dans push_subscriptions
  //    avec p256dh='fcm' ; les abonnements Web Push ont de vraies clés VAPID.
  if (push) {
    const subs = await db.PushSubscription.findAll({ where: { user_id: userId } });
    const webSubs = subs.filter((s) => s.p256dh !== 'fcm');
    const fcmTokens = subs.filter((s) => s.p256dh === 'fcm').map((s) => s.endpoint);

    // 3a) Web Push (navigateur) — uniquement si VAPID est configuré.
    if (ensureVapid() && webSubs.length) {
      await Promise.allSettled(
        webSubs.map(async (s) => {
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

    // 3b) FCM (mobile) — purge les jetons invalides retournés par Firebase.
    if (fcmTokens.length) {
      const { invalidTokens } = await sendPush(fcmTokens, { title, body: message, data })
        .catch((err) => {
          logger.warn({ err: err?.message, userId }, 'fcm push failed');
          return { invalidTokens: [] };
        });
      if (invalidTokens.length) {
        await db.PushSubscription.destroy({ where: { user_id: userId, endpoint: invalidTokens } });
      }
    }
  }

  // 4) Transactional email (opt-in per call) — respecte la préférence email de l'utilisateur.
  if (email && (await emailAllowed(userId, type))) {
    const profile = await db.Profile.findByPk(userId, { attributes: ['email'] });
    if (profile?.email) {
      await sendEmail({ to: profile.email, subject: title, text: message }).catch((err) =>
        logger.warn({ err: err?.message, userId }, 'notification email failed'),
      );
    }
  }
}

/**
 * Chaque type de notification est rattaché à une catégorie de préférence email. Sémantique
 * OPT-OUT : on envoie par défaut ; on ne bloque que si l'utilisateur a EXPLICITEMENT désactivé
 * la catégorie (« email si autorisé par l'utilisateur »).
 */
const EMAIL_FLAG_BY_TYPE = {
  event_reminder: 'email_concerts',
  badge: 'email_system',
  admin_report: 'email_system',
  duel_request: 'email_duels',
  dedication_received: 'email_concerts',
  dedication_delivered: 'email_concerts',
  reward: 'email_system',
  season_winner_announced: 'email_system',
  moderation: 'email_system',
  withdrawal: 'email_system',
  sponsor: 'email_requests',
  sponsor_payment_due: 'email_requests',
  referral: 'email_system',
  concert_approval: 'email_concerts',
  artist_request: 'email_requests',
  gift_received: 'email_gifts',
  follower: 'email_system',
  duel_result: 'email_duels',
  competition_result: 'email_system',
  live_started: 'email_lives',
};

async function emailAllowed(userId, type) {
  const flag = EMAIL_FLAG_BY_TYPE[type] || 'email_system';
  const pref = await db.EmailNotificationPreference.findOne({ where: { user_id: userId } }).catch(() => null);
  // Pas de préférence enregistrée → autorisé (opt-out). Sinon on respecte la bascule.
  return pref ? pref[flag] !== false : true;
}

export default { notifyUser };
