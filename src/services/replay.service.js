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
const SOURCE_FK = { duel: 'duel_id', concert: 'concert_id', competition: 'competition_id' };

/**
 * Computes whether a user may watch a replay.
 * @param {object} replay
 * @param {string|null} userId
 * @param {object|null} accessRow - A `replay_access` row, if any.
 * @returns {boolean}
 */
function computeAccess(replay, userId, accessRow) {
  if (!replay.is_premium) return true;
  if (userId && (replay.created_by === userId || replay.artist_id === userId)) return true;
  return Boolean(accessRow);
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
  // Comma-separated id lists (batch): `duelIds=a,b`, `competitionIds=a,b`.
  if (query.duelIds) where.duel_id = { [Op.in]: String(query.duelIds).split(',').filter(Boolean) };
  if (query.competitionIds) where.competition_id = { [Op.in]: String(query.competitionIds).split(',').filter(Boolean) };
  if (query.isPublic === 'true') where.is_public = true;
  if (query.isPublic === 'false') where.is_public = false;
  // `mine=true`: replays the caller authored OR performed in.
  if (query.mine === 'true' && viewerId) {
    where[Op.or] = [{ created_by: viewerId }, { artist_id: viewerId }];
  }
  const rows = await db.ReplayVideo.findAll({ where, order, limit, offset, raw: true });

  const artists = await getDisplayProfiles(rows.map((r) => r.artist_id).filter(Boolean));
  const byId = new Map(artists.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({ ...r, artist: byId.get(r.artist_id) ?? null }));
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
  if (userId) {
    accessRow = await db.ReplayAccess.findOne({ where: { replay_id: id, user_id: userId }, raw: true });
    liked = Boolean(await db.ReplayLike.findOne({ where: { replay_id: id, user_id: userId } }));
  }
  const [artist] = await getDisplayProfiles([replay.artist_id]);
  return { ...replay, artist: artist ?? null, likes, hasAccess: computeAccess(replay, userId, accessRow), liked };
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
  for (const k of ['title', 'description', 'thumbnail_url', 'is_public', 'is_premium', 'replay_price']) {
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
  const accessRow = userId
    ? await db.ReplayAccess.findOne({ where: { replay_id: id, user_id: userId }, raw: true })
    : null;
  return { hasAccess: computeAccess(replay, userId, accessRow) };
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
