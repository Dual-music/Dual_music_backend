import { db } from '../models/index.js';

/**
 * @file Content sharing domain service.
 *
 * Records social-share events (`content_shares`) for any content entity and
 * exposes per-content share counts. Mirrors the frontend's share tracking on
 * duels/concerts/competitions/lifestyle/blog cards.
 *
 * @module services/content.service
 */

/**
 * Records a share event for a content entity.
 * @param {object} params
 * @param {string} params.contentType - Free-form content kind (e.g. `duel`, `blog`).
 * @param {string} params.contentId
 * @param {string|null} params.userId - Sharer (nullable for anonymous shares).
 * @param {string} [params.platform='unknown'] - Destination platform.
 * @returns {Promise<object>} The created share row.
 */
export async function recordShare({ contentType, contentId, userId, platform }) {
  return db.ContentShare.create({
    content_type: contentType,
    content_id: contentId,
    user_id: userId ?? null,
    platform: platform ?? 'unknown',
  });
}

/**
 * Counts recorded shares for a content entity.
 * @param {object} params
 * @param {string} params.contentType
 * @param {string} params.contentId
 * @returns {Promise<{ count: number }>}
 */
export async function countShares({ contentType, contentId }) {
  const count = await db.ContentShare.count({ where: { content_type: contentType, content_id: contentId } });
  return { count };
}

export default { recordShare, countShares };
