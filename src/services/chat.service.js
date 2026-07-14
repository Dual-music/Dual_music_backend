import { canModerate } from '../middlewares/rbac.js';
import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { sanitizeText } from '../utils/sanitize.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Generic event-chat service.
 *
 * All event chats (`duel_chat_messages`, `concert_chat_messages`,
 * `competition_chat_messages`, `live_chat_messages`) share the same shape
 * (event fk + user_id + message + optional `parent_id` for threaded replies +
 * `is_moderated`). This service is parameterized by the Sequelize model, the fk
 * column and whether threading is supported, and enriches each message with the
 * author's display profile (mirroring the frontend's `get_display_profiles`
 * hydration).
 *
 * @module services/chat.service
 */

/**
 * Lists messages for an event (newest-first, paginated), hydrated with authors.
 * @param {object} cfg
 * @param {import('sequelize').ModelStatic<any>} cfg.model
 * @param {string} cfg.fk - Event foreign-key column (e.g. 'duel_id').
 * @param {string} eventId
 * @param {object} query - Pagination query.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listMessages({ model, fk }, eventId, query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  where[fk] = eventId;
  where.is_moderated = false;
  const rows = await model.findAll({ where, order, limit, offset, raw: true });

  const profiles = await getDisplayProfiles(rows.map((r) => r.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({
    ...r,
    author: byId.get(r.user_id) || { id: r.user_id, full_name: null, avatar_url: null },
  }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Posts a message (optionally a threaded reply) to an event chat.
 * @param {object} cfg
 * @param {import('sequelize').ModelStatic<any>} cfg.model
 * @param {string} cfg.fk
 * @param {boolean} [cfg.threaded=true] - Whether `parent_id` is supported.
 * @param {object} input
 * @param {string} input.eventId
 * @param {string} input.userId
 * @param {string} input.message
 * @param {string|null} [input.parentId]
 * @returns {Promise<object>} The created message with its author.
 */
export async function postMessage({ model, fk, threaded = true, kind }, { eventId, userId, message, parentId = null }) {
  const payload = { [fk]: eventId, user_id: userId, message: sanitizeText(message) };
  if (threaded && parentId) payload.parent_id = parentId;
  const created = await model.create(payload);

  const [author] = await getDisplayProfiles([userId]);
  const full = { ...created.get({ plain: true }), author: author || { id: userId, full_name: null, avatar_url: null } };

  // Broadcast to the event's chat room (no-op if realtime is not attached).
  if (kind) emitToRoom('/chat', roomName(kind, eventId), 'message', full);
  return full;
}

/**
 * Soft-moderates (hides) a message. Author or moderators/admins only.
 * @param {object} cfg
 * @param {import('sequelize').ModelStatic<any>} cfg.model
 * @param {string} messageId
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @returns {Promise<void>}
 */
export async function moderateMessage({ model }, messageId, actor, actorRoles) {
  const msg = await model.findByPk(messageId);
  if (!msg) throw ApiError.notFound('NOT_FOUND');
  if (!canModerate(actor, actorRoles, msg.user_id)) throw ApiError.forbidden('FORBIDDEN');
  msg.is_moderated = true;
  await msg.save();
}

/** Chat model bindings per event type. */
export const CHAT_BINDINGS = {
  duel: { model: db.DuelChatMessage, fk: 'duel_id', threaded: true, kind: 'duel' },
  concert: { model: db.ConcertChatMessage, fk: 'concert_id', threaded: true, kind: 'concert' },
  competition: { model: db.CompetitionChatMessage, fk: 'competition_id', threaded: true, kind: 'competition' },
  live: { model: db.LiveChatMessage, fk: 'live_id', threaded: false, kind: 'live' },
};

export default { listMessages, postMessage, moderateMessage, CHAT_BINDINGS };
