import { QueryTypes } from 'sequelize';

import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';

import { getDisplayProfiles } from './user.service.js';

/** Room for a live's realtime channel. */
const liveRoom = (id) => roomName('live', id);

/**
 * @file Lives domain service — spontaneous artist live streams with chat, gifts
 * and likes (no ticketing). Reproduces `artist_lives`, `live_likes` and
 * `live_join_requests`, including the `increment_live_likes` RPC.
 *
 * @module services/live.service
 */

/**
 * Lists lives (active first), paginated, with artist display profiles.
 * @param {object} query - `status?`, pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listLives(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  const rows = await db.ArtistLive.findAll({ where, order, limit, offset, raw: true });
  const profiles = await getDisplayProfiles(rows.map((r) => r.artist_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({ ...r, artist: byId.get(r.artist_id) || null }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a single live with its artist profile and like count.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getLive(id) {
  const live = await db.ArtistLive.findByPk(id, { raw: true });
  if (!live) throw ApiError.notFound('NOT_FOUND');
  const [[artist], artistProfile, likes] = await Promise.all([
    getDisplayProfiles([live.artist_id]),
    db.ArtistProfile.findOne({ where: { user_id: live.artist_id }, attributes: ['stage_name'], raw: true }),
    db.LiveLike.findByPk(id),
  ]);
  return {
    ...live,
    artist: artist ? { ...artist, stage_name: artistProfile?.stage_name ?? null } : null,
    likes: likes ? Number(likes.likes_count) : 0,
  };
}

/**
 * Returns the report summary for a live: total report count and — when a viewer
 * is provided — whether that viewer has already reported it. Powers the
 * client-side auto-stop heuristic in the live report button.
 * @param {string} liveId
 * @param {string|null} [userId]
 * @returns {Promise<{ count: number, hasReported: boolean }>}
 */
export async function getReportSummary(liveId, userId = null) {
  const [count, ownCount] = await Promise.all([
    db.LiveReport.count({ where: { live_id: liveId } }),
    userId ? db.LiveReport.count({ where: { live_id: liveId, user_id: userId } }) : Promise.resolve(0),
  ]);
  return { count, hasReported: ownCount > 0 };
}

/**
 * Resolves `{ id, title }` for a set of live ids (enrichment for admin/report
 * views that only hold ids). Deduplicates and caps at 500 ids.
 * @param {string[]} ids
 * @returns {Promise<Array<{ id: string, title: string|null }>>}
 */
export async function getLiveTitlesByIds(ids) {
  const list = [...new Set((ids ?? []).filter(Boolean))].slice(0, 500);
  if (list.length === 0) return [];
  const { Op } = db.Sequelize;
  return db.ArtistLive.findAll({
    where: { id: { [Op.in]: list } },
    attributes: ['id', 'title'],
    raw: true,
  });
}

/**
 * Starts a live for an artist.
 * @param {string} artistId
 * @param {{ title?: string, roomId?: string, streamUrl?: string }} input
 * @returns {Promise<object>}
 */
export async function startLive(artistId, input) {
  return db.ArtistLive.create({
    artist_id: artistId,
    title: input.title ?? null,
    room_id: input.roomId ?? null,
    stream_url: input.streamUrl ?? null,
    status: 'live',
    started_at: new Date(),
  });
}

/**
 * Ends a live (host or admin/moderator).
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} [roles]
 * @returns {Promise<object>}
 */
export async function endLive(id, actorId, roles = []) {
  const live = await db.ArtistLive.findByPk(id);
  if (!live) throw ApiError.notFound('NOT_FOUND');
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (live.artist_id !== actorId && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  live.status = 'ended';
  live.ended_at = new Date();
  await live.save();
  emitToRoom('/live', liveRoom(id), 'status', { live_id: id, status: 'ended' });
  return live;
}

/**
 * Updates a live's lifecycle status (host or admin/moderator). On `live` sets
 * `started_at` if not already set; on `ended` sets `ended_at`. Broadcasts the
 * new status to the room (mirrors {@link endLive}'s emit).
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} [roles]
 * @param {'live'|'ended'|'upcoming'} status
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403.
 */
export async function updateLiveStatus(id, actorId, roles = [], status) {
  const live = await db.ArtistLive.findByPk(id);
  if (!live) throw ApiError.notFound('NOT_FOUND');
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (live.artist_id !== actorId && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  live.status = status;
  if (status === 'live' && !live.started_at) live.started_at = new Date();
  if (status === 'ended' && !live.ended_at) live.ended_at = new Date();
  await live.save();
  emitToRoom('/live', liveRoom(id), 'status', { live_id: id, status });
  return live;
}

/**
 * Atomically increments a live's like counter (mirrors `increment_live_likes`).
 * @param {string} liveId
 * @returns {Promise<{ likes: number }>}
 */
export async function incrementLikes(liveId) {
  await db.sequelize.query(
    `INSERT INTO live_likes (live_id, likes_count, updated_at) VALUES (:id, 1, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE likes_count = likes_count + 1, updated_at = UTC_TIMESTAMP()`,
    { replacements: { id: liveId }, type: QueryTypes.INSERT },
  );
  const [row] = await db.sequelize.query('SELECT likes_count FROM live_likes WHERE live_id = :id', {
    replacements: { id: liveId },
    type: QueryTypes.SELECT,
  });
  const likes = row ? Number(row.likes_count) : 0;
  emitToRoom('/live', liveRoom(liveId), 'likes', { live_id: liveId, likes });
  return { likes };
}

/**
 * Reads a live's current like count (no increment).
 * @param {string} liveId
 * @returns {Promise<{ likes: number }>}
 */
export async function getLikes(liveId) {
  const [row] = await db.sequelize.query('SELECT likes_count FROM live_likes WHERE live_id = :id', {
    replacements: { id: liveId },
    type: QueryTypes.SELECT,
  });
  return { likes: row ? Number(row.likes_count) : 0 };
}

/**
 * Requests to join a live as a guest.
 * @param {string} liveId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function requestJoin(liveId, userId) {
  const [row] = await db.LiveJoinRequest.findOrCreate({
    where: { live_id: liveId, user_id: userId, status: 'pending' },
    defaults: { live_id: liveId, user_id: userId, status: 'pending', requested_at: new Date() },
  });
  emitToRoom('/live', liveRoom(liveId), 'join:new', { live_id: liveId, request_id: row.id, user_id: userId });
  return row;
}

/**
 * Lists a live's join requests (host/admin view). Optionally filters by status
 * (e.g. `pending`, `accepted`). Replaces the frontend's direct
 * `supabase.from('live_join_requests')` reads in HostGuestControls.
 * @param {string} liveId
 * @param {string} [status]
 * @returns {Promise<object[]>}
 */
export async function listJoinRequests(liveId, status) {
  const where = { live_id: liveId };
  if (status) where.status = status;
  return db.LiveJoinRequest.findAll({ where, order: [['requested_at', 'DESC']], raw: true });
}

/**
 * Host responds to a join request (accept/reject/end).
 * @param {string} requestId
 * @param {string} hostId
 * @param {'accepted'|'rejected'|'ended'} status
 * @returns {Promise<object>}
 */
export async function respondJoin(requestId, hostId, status) {
  const req = await db.LiveJoinRequest.findByPk(requestId);
  if (!req) throw ApiError.notFound('NOT_FOUND');
  const live = await db.ArtistLive.findByPk(req.live_id);
  if (!live || live.artist_id !== hostId) throw ApiError.forbidden('FORBIDDEN');
  req.status = status;
  if (status === 'accepted') req.accepted_at = new Date();
  if (status === 'ended') req.ended_at = new Date();
  await req.save();
  emitToRoom('/live', liveRoom(req.live_id), 'join:update', { live_id: req.live_id, request_id: req.id, status, user_id: req.user_id });
  return req;
}

/**
 * Cancels a pending join request. The requester may cancel their own request;
 * the live's host or an admin may also cancel it. Sets status `cancelled` and
 * broadcasts the update.
 * @param {string} requestId
 * @param {string} actorId
 * @param {string[]} [roles]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403.
 */
export async function cancelJoinRequest(requestId, actorId, roles = []) {
  const req = await db.LiveJoinRequest.findByPk(requestId);
  if (!req) throw ApiError.notFound('NOT_FOUND');
  if (req.user_id !== actorId && !roles.includes('admin')) {
    const live = await db.ArtistLive.findByPk(req.live_id, { attributes: ['artist_id'], raw: true });
    if (!live || live.artist_id !== actorId) throw ApiError.forbidden('FORBIDDEN');
  }
  req.status = 'cancelled';
  await req.save();
  emitToRoom('/live', liveRoom(req.live_id), 'join:update', {
    live_id: req.live_id,
    request_id: req.id,
    status: 'cancelled',
    user_id: req.user_id,
  });
  return req;
}

export default { listLives, getLive, getReportSummary, getLiveTitlesByIds, startLive, endLive, updateLiveStatus, incrementLikes, getLikes, requestJoin, listJoinRequests, respondJoin, cancelJoinRequest };
