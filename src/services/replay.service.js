import { Op } from 'sequelize';

import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { sanitizeText } from '../utils/sanitize.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Replays domain service.
 *
 * A replay (`replay_videos`) is the recorded/composite VOD of a past event
 * (duel/concert/competition). Access rules: a non-premium replay is open; a
 * premium replay requires ownership or a paid `replay_access` row (unlocked via
 * the wallet procedure `purchase_replay_access_from_wallet`, exposed under the
 * wallet module). This service owns listing, detail (+likes/access flags),
 * recording persistence, owner/admin edits, likes and view counting.
 *
 * @module services/replay.service
 */

/** source_type → the event FK column it populates. */
// `live` était absent : un replay issu d'un LIVE (`recording.service.js#concatenateSession`)
// n'avait aucune colonne où stocker l'id d'origine → `createReplay` échouait systématiquement
// avec VALIDATION_ERROR pour ce type (avalé en `status:'failed'`, aucun replay de live n'était
// donc jamais réellement créé).
const SOURCE_FK = { duel: 'duel_id', concert: 'concert_id', competition: 'competition_id', live: 'live_id' };

/**
 * MySQL/mysql2 returns TINYINT(1) BOOLEAN columns as raw `0`/`1` numbers on `raw: true`
 * queries. Strictly-typed JSON decoders (the Android app's kotlinx.serialization `Boolean`
 * fields) reject a JSON `1`/`0` for a boolean field outright — the whole row fails to parse,
 * which can silently empty an entire list client-side. Coerce to real booleans before sending
 * (same fix already applied to lives — see `live.service.js#castLiveBooleans`).
 */
function castReplayBooleans(row) {
  return { ...row, is_public: !!row.is_public, is_premium: !!row.is_premium };
}

/**
 * Computes whether a user may watch a replay: free if not premium, free for the
 * owner/artist, free for a paid `replay_access` row, AND free for anyone who actually
 * attended the source event live (`stream_attendance` — see {@link attendedSource}), as
 * requested: a paid replay stays free for whoever watched the direct, and only charges
 * those who missed it.
 * @param {object} replay
 * @param {string|null} userId
 * @param {object|null} accessRow - A `replay_access` row, if any.
 * @param {boolean} attended - Whether `userId` is in `stream_attendance` for this replay's source event.
 * @returns {boolean}
 */
function computeAccess(replay, userId, accessRow, attended = false) {
  if (!replay.is_premium) return true;
  if (userId && (replay.created_by === userId || replay.artist_id === userId)) return true;
  return Boolean(accessRow) || attended;
}

/**
 * Whether `userId` is recorded as having attended the LIVE run of this replay's source event
 * (`stream_attendance`, populated at Socket.IO join time — see `realtime/index.js`).
 * @param {object} replay - Raw `replay_videos` row (needs `source_type` + its FK column).
 * @param {string|null} userId
 * @returns {Promise<boolean>}
 */
async function attendedSource(replay, userId) {
  if (!userId) return false;
  const fk = SOURCE_FK[replay.source_type];
  const eventId = fk ? replay[fk] : null;
  if (!eventId) return false;
  const row = await db.StreamAttendance.findOne({
    where: { user_id: userId, event_type: replay.source_type, event_id: eventId },
    raw: true,
  });
  return Boolean(row);
}

/**
 * Lists replays (newest first), filterable by source type / artist / visibility.
 * @param {object} query - `sourceType?`, `artistId?`, `isPublic?` + pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listReplays(query, viewerId = null) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.sourceType) where.source_type = query.sourceType;
  if (query.artistId) where.artist_id = query.artistId;
  if (query.duelId) where.duel_id = query.duelId;
  if (query.competitionId) where.competition_id = query.competitionId;
  if (query.concertId) where.concert_id = query.concertId;
  if (query.liveId) where.live_id = query.liveId;
  // Comma-separated id lists (batch): `duelIds=a,b`, `competitionIds=a,b`.
  if (query.duelIds) where.duel_id = { [Op.in]: String(query.duelIds).split(',').filter(Boolean) };
  if (query.competitionIds) where.competition_id = { [Op.in]: String(query.competitionIds).split(',').filter(Boolean) };
  if (query.isPublic === 'true') where.is_public = true;
  if (query.isPublic === 'false') where.is_public = false;
  // `mine=true`: replays the caller authored OR performed in. A duel replay only carries ONE
  // `artist_id` (the recording is started with `artist1_id`, see `duel.service.js`), so the
  // SECOND participant never matched `created_by`/`artist_id` and could never see their own
  // duel's replay here — closed by also matching on duels where the caller is either combatant.
  if (query.mine === 'true' && viewerId) {
    const myDuelIds = await db.Duel.findAll({
      where: { [Op.or]: [{ artist1_id: viewerId }, { artist2_id: viewerId }] },
      attributes: ['id'],
      raw: true,
    }).then((rows) => rows.map((r) => r.id));
    where[Op.or] = [
      { created_by: viewerId },
      { artist_id: viewerId },
      ...(myDuelIds.length ? [{ duel_id: { [Op.in]: myDuelIds } }] : []),
    ];
  }
  const rows = await db.ReplayVideo.findAll({ where, order, limit, offset, raw: true });

  const artists = await getDisplayProfiles(rows.map((r) => r.artist_id).filter(Boolean));
  const byId = new Map(artists.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({ ...castReplayBooleans(r), artist: byId.get(r.artist_id) ?? null }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a replay with its like count and, for an authenticated caller, their
 * access + like state. Never leaks the video to a premium non-owner without
 * access (the controller/UI gates playback on `hasAccess`).
 * @param {string} id
 * @param {string|null} [userId]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function getReplay(id, userId = null) {
  const replay = await db.ReplayVideo.findByPk(id, { raw: true });
  if (!replay) throw ApiError.notFound('NOT_FOUND');
  const likes = await db.ReplayLike.count({ where: { replay_id: id } });
  let accessRow = null;
  let liked = false;
  let attended = false;
  if (userId) {
    [accessRow, liked, attended] = await Promise.all([
      db.ReplayAccess.findOne({ where: { replay_id: id, user_id: userId }, raw: true }),
      db.ReplayLike.findOne({ where: { replay_id: id, user_id: userId } }).then(Boolean),
      attendedSource(replay, userId),
    ]);
  }
  const [artist] = await getDisplayProfiles([replay.artist_id]);
  return { ...castReplayBooleans(replay), artist: artist ?? null, likes, hasAccess: computeAccess(replay, userId, accessRow, attended), liked };
}

/**
 * Persists a replay recording for an event (host/owner action).
 * @param {string} userId - The creator (host).
 * @param {object} input - `{ sourceType, eventId, artistId?, title, videoUrl, thumbnailUrl?, description?, duration?, isPremium?, isPublic?, replayPrice? }`
 * @returns {Promise<object>}
 * @throws {ApiError} 400 when the source type is unknown.
 */
export async function createReplay(userId, input) {
  const fk = SOURCE_FK[input.sourceType];
  if (!fk) throw ApiError.badRequest('VALIDATION_ERROR', { details: { sourceType: input.sourceType } });
  return db.ReplayVideo.create({
    title: sanitizeText(input.title, { maxLength: 200 }),
    description: sanitizeText(input.description ?? ''),
    video_url: input.videoUrl,
    thumbnail_url: input.thumbnailUrl ?? null,
    source_type: input.sourceType,
    [fk]: input.eventId,
    artist_id: input.artistId ?? userId,
    created_by: userId,
    duration: input.duration ?? 0,
    is_premium: input.isPremium ?? false,
    is_public: input.isPublic ?? true,
    replay_price: input.replayPrice ?? 0,
    recorded_date: input.recordedDate ?? new Date(),
    views_count: 0,
  });
}

/** Asserts the caller owns the replay or is an admin/moderator. */
async function assertCanEdit(id, userId, roles) {
  const replay = await db.ReplayVideo.findByPk(id);
  if (!replay) throw ApiError.notFound('NOT_FOUND');
  const isOwner = replay.created_by === userId || replay.artist_id === userId;
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!isOwner && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  return replay;
}

/**
 * Updates a replay's metadata (owner/staff only, whitelisted fields).
 * @param {string} id
 * @param {string} userId
 * @param {string[]} roles
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403.
 */
export async function updateReplay(id, userId, roles, patch) {
  const replay = await assertCanEdit(id, userId, roles);
  for (const k of ['title', 'description', 'thumbnail_url', 'video_url', 'is_public', 'is_premium', 'replay_price']) {
    if (patch[k] !== undefined) replay[k] = patch[k];
  }
  await replay.save();
  return replay;
}

/**
 * Deletes a replay (owner/staff only).
 * @param {string} id
 * @param {string} userId
 * @param {string[]} roles
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteReplay(id, userId, roles) {
  await assertCanEdit(id, userId, roles);
  const removed = await db.ReplayVideo.destroy({ where: { id } });
  return { removed: removed > 0 };
}

/**
 * Increments a replay's view counter (fire-and-forget on playback).
 * @param {string} id
 * @returns {Promise<{ views: number }>}
 * @throws {ApiError} 404 when not found.
 */
export async function incrementViews(id) {
  const [count] = await db.ReplayVideo.increment('views_count', { where: { id }, by: 1 });
  // Sequelize returns [[affectedRows], meta]; fall back to a re-read for the value.
  const replay = await db.ReplayVideo.findByPk(id, { attributes: ['views_count'], raw: true });
  if (!replay) throw ApiError.notFound('NOT_FOUND');
  return { views: Number(replay.views_count), _affected: count };
}

/**
 * Toggles the caller's like on a replay.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ liked: boolean, likes: number }>}
 */
export async function toggleLike(userId, id) {
  const existing = await db.ReplayLike.findOne({ where: { replay_id: id, user_id: userId } });
  let liked;
  if (existing) {
    await existing.destroy();
    liked = false;
  } else {
    await db.ReplayLike.create({ replay_id: id, user_id: userId });
    liked = true;
  }
  const likes = await db.ReplayLike.count({ where: { replay_id: id } });
  return { liked, likes };
}

/**
 * Returns whether a user can watch a replay (public/owner/unlocked).
 * @param {string} id
 * @param {string|null} userId
 * @returns {Promise<{ hasAccess: boolean }>}
 * @throws {ApiError} 404 when not found.
 */
export async function checkAccess(id, userId) {
  const replay = await db.ReplayVideo.findByPk(id, { raw: true });
  if (!replay) throw ApiError.notFound('NOT_FOUND');
  const [accessRow, attended] = userId
    ? await Promise.all([
        db.ReplayAccess.findOne({ where: { replay_id: id, user_id: userId }, raw: true }),
        attendedSource(replay, userId),
      ])
    : [null, false];
  return { hasAccess: computeAccess(replay, userId, accessRow, attended) };
}

export default {
  listReplays,
  getReplay,
  createReplay,
  updateReplay,
  deleteReplay,
  incrementViews,
  toggleLike,
  checkAccess,
};
