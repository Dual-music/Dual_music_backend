import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { sanitizeText } from '../utils/sanitize.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Comments domain service.
 *
 * Comments (`comments`) are user-authored and polymorphic: each targets a piece
 * of content via `(content_type, content_id)` (e.g. `duel`, `live`, `lifestyle`,
 * `blog`, `replay`). Threads are one level deep via `parent_id`. Likes live in
 * `comment_likes`; the denormalized `likes_count` on the comment row is kept in
 * sync. Authors (or staff) may delete their comments.
 *
 * @module services/comment.service
 */

/** Content types a comment may target (mirrors the frontend). */
export const CONTENT_TYPES = ['duel', 'live', 'lifestyle', 'blog', 'replay'];

/**
 * Lists comments for a target (newest first) as a flat list, enriched with the
 * author profile and — for an authenticated caller — a per-comment `liked` flag.
 * The client assembles the reply tree from `parent_id`.
 * @param {object} query - `{ contentType, contentId }`.
 * @param {string|null} [userId]
 * @returns {Promise<object[]>}
 */
export async function listComments(query, userId = null) {
  const rows = await db.Comment.findAll({
    where: { content_type: query.contentType, content_id: query.contentId },
    order: [['created_at', 'DESC']],
    raw: true,
  });
  if (rows.length === 0) return [];

  const profiles = await getDisplayProfiles(rows.map((r) => r.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const ids = rows.map((r) => r.id);
  const likes = await db.CommentLike.findAll({ where: { comment_id: ids }, raw: true });
  const likeCount = new Map();
  const likedByMe = new Set();
  for (const l of likes) {
    likeCount.set(l.comment_id, (likeCount.get(l.comment_id) || 0) + 1);
    if (userId && l.user_id === userId) likedByMe.add(l.comment_id);
  }

  return rows.map((r) => ({
    ...r,
    likes_count: likeCount.get(r.id) ?? r.likes_count ?? 0,
    liked: likedByMe.has(r.id),
    profile: byId.get(r.user_id) ?? null,
  }));
}

/**
 * Creates a comment authored by the caller.
 * @param {string} userId - The author.
 * @param {object} input - `{ contentType, contentId, content, parentId? }`
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when `parentId` refers to a missing comment.
 */
export async function createComment(userId, input) {
  if (input.parentId) {
    const parent = await db.Comment.findByPk(input.parentId, { attributes: ['id'] });
    if (!parent) throw ApiError.notFound('NOT_FOUND');
  }
  return db.Comment.create({
    user_id: userId,
    content: sanitizeText(input.content, { maxLength: 4000 }),
    content_type: input.contentType,
    content_id: input.contentId,
    parent_id: input.parentId ?? null,
    likes_count: 0,
  });
}

/**
 * Deletes a comment (author or staff only). Soft-delete via the paranoid model.
 * @param {string} id
 * @param {string} userId
 * @param {string[]} roles
 * @returns {Promise<{ removed: boolean }>}
 * @throws {ApiError} 404 · 403.
 */
export async function deleteComment(id, userId, roles) {
  const comment = await db.Comment.findByPk(id);
  if (!comment) throw ApiError.notFound('NOT_FOUND');
  const isOwner = comment.user_id === userId;
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!isOwner && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  const removed = await db.Comment.destroy({ where: { id } });
  return { removed: removed > 0 };
}

/**
 * Toggles the caller's like on a comment (via `comment_likes`), keeping the
 * denormalized `likes_count` in sync.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ liked: boolean, likes: number }>}
 * @throws {ApiError} 404 when the comment does not exist.
 */
export async function toggleLike(userId, id) {
  const comment = await db.Comment.findByPk(id);
  if (!comment) throw ApiError.notFound('NOT_FOUND');
  const existing = await db.CommentLike.findOne({ where: { comment_id: id, user_id: userId } });
  let liked;
  if (existing) {
    await existing.destroy();
    liked = false;
  } else {
    await db.CommentLike.create({ comment_id: id, user_id: userId });
    liked = true;
  }
  const likes = await db.CommentLike.count({ where: { comment_id: id } });
  comment.likes_count = likes;
  await comment.save();
  return { liked, likes };
}

export default {
  CONTENT_TYPES,
  listComments,
  createComment,
  deleteComment,
  toggleLike,
};
