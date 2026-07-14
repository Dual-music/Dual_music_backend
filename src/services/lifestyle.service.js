import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { sanitizeText } from '../utils/sanitize.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Lifestyle videos domain service.
 *
 * A lifestyle video (`lifestyle_videos`) is a short artist-authored VOD. Reads
 * are public; an artist owns their uploads (owner or staff may edit/delete).
 * Likes are stored in `video_interactions` (`interaction_type = 'like'`), with a
 * denormalized `likes_count` kept in sync on the video row; `views_count` is a
 * simple counter bumped on playback.
 *
 * @module services/lifestyle.service
 */

/** interaction_type used for a like on a lifestyle video. */
const LIKE = 'like';

/**
 * Lists lifestyle videos (newest first), optionally filtered by artist.
 * @param {object} query - `artistId?` + pagination (`limit`/`cursor`/`page`).
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listVideos(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.artistId) where.artist_id = query.artistId;
  const rows = await db.LifestyleVideo.findAll({ where, order, limit, offset, raw: true });

  const artists = await getDisplayProfiles(rows.map((r) => r.artist_id).filter(Boolean));
  const byId = new Map(artists.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({ ...r, artist: byId.get(r.artist_id) ?? null }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a lifestyle video with its artist profile and, for an authenticated
 * caller, whether they have liked it.
 * @param {string} id
 * @param {string|null} [userId]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function getVideo(id, userId = null) {
  const video = await db.LifestyleVideo.findByPk(id, { raw: true });
  if (!video) throw ApiError.notFound('NOT_FOUND');
  const [artist] = await getDisplayProfiles([video.artist_id]);
  let liked = false;
  if (userId) {
    liked = Boolean(
      await db.VideoInteraction.findOne({
        where: { video_id: id, user_id: userId, interaction_type: LIKE },
      }),
    );
  }
  return { ...video, artist: artist ?? null, liked };
}

/**
 * Persists a lifestyle video for the calling artist.
 * @param {string} userId - The uploading artist.
 * @param {object} input - `{ artistName, title, videoUrl, description?, thumbnailUrl?, duration }`
 * @returns {Promise<object>}
 */
export async function createVideo(userId, input) {
  return db.LifestyleVideo.create({
    artist_id: userId,
    artist_name: sanitizeText(input.artistName, { maxLength: 255 }),
    title: sanitizeText(input.title, { maxLength: 255 }),
    description: input.description != null ? sanitizeText(input.description) : null,
    video_url: input.videoUrl,
    thumbnail_url: input.thumbnailUrl ?? null,
    duration: input.duration,
    likes_count: 0,
    views_count: 0,
    comments_count: 0,
  });
}

/**
 * Asserts the caller owns the video or is an admin/moderator, returning it.
 * @param {string} id
 * @param {string} userId
 * @param {string[]} roles
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403.
 */
async function assertCanEdit(id, userId, roles) {
  const video = await db.LifestyleVideo.findByPk(id);
  if (!video) throw ApiError.notFound('NOT_FOUND');
  const isOwner = video.artist_id === userId;
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!isOwner && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  return video;
}

/**
 * Updates a lifestyle video's metadata (owner/staff only, whitelisted fields).
 * @param {string} id
 * @param {string} userId
 * @param {string[]} roles
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403.
 */
export async function updateVideo(id, userId, roles, patch) {
  const video = await assertCanEdit(id, userId, roles);
  if (patch.title !== undefined) video.title = sanitizeText(patch.title, { maxLength: 255 });
  if (patch.description !== undefined) {
    video.description = patch.description != null ? sanitizeText(patch.description) : null;
  }
  if (patch.thumbnailUrl !== undefined) video.thumbnail_url = patch.thumbnailUrl;
  if (patch.videoUrl !== undefined) video.video_url = patch.videoUrl;
  if (patch.duration !== undefined) video.duration = patch.duration;
  await video.save();
  return video;
}

/**
 * Soft-deletes a lifestyle video (owner/staff only).
 * @param {string} id
 * @param {string} userId
 * @param {string[]} roles
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteVideo(id, userId, roles) {
  await assertCanEdit(id, userId, roles);
  const removed = await db.LifestyleVideo.destroy({ where: { id } });
  return { removed: removed > 0 };
}

/**
 * Increments a video's view counter (fire-and-forget on playback).
 * @param {string} id
 * @returns {Promise<{ views: number }>}
 * @throws {ApiError} 404 when not found.
 */
export async function incrementViews(id) {
  await db.LifestyleVideo.increment('views_count', { where: { id }, by: 1 });
  const video = await db.LifestyleVideo.findByPk(id, { attributes: ['views_count'], raw: true });
  if (!video) throw ApiError.notFound('NOT_FOUND');
  return { views: Number(video.views_count) };
}

/**
 * Toggles the caller's like on a lifestyle video (via `video_interactions`),
 * keeping the denormalized `likes_count` in sync.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ liked: boolean, likes: number }>}
 * @throws {ApiError} 404 when the video does not exist.
 */
export async function toggleLike(userId, id) {
  const video = await db.LifestyleVideo.findByPk(id);
  if (!video) throw ApiError.notFound('NOT_FOUND');
  const existing = await db.VideoInteraction.findOne({
    where: { video_id: id, user_id: userId, interaction_type: LIKE },
  });
  let liked;
  if (existing) {
    await existing.destroy();
    liked = false;
  } else {
    await db.VideoInteraction.create({ video_id: id, user_id: userId, interaction_type: LIKE });
    liked = true;
  }
  const likes = await db.VideoInteraction.count({ where: { video_id: id, interaction_type: LIKE } });
  video.likes_count = likes;
  await video.save();
  return { liked, likes };
}

/**
 * Returns the ids of lifestyle videos the caller has liked (via
 * `video_interactions`), so a list view can pre-highlight liked cards without a
 * per-video lookup.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function listLikedVideoIds(userId) {
  const rows = await db.VideoInteraction.findAll({
    where: { user_id: userId, interaction_type: LIKE },
    attributes: ['video_id'],
    raw: true,
  });
  return rows.map((r) => r.video_id);
}

export default {
  listVideos,
  getVideo,
  listLikedVideoIds,
  createVideo,
  updateVideo,
  deleteVideo,
  incrementViews,
  toggleLike,
};
