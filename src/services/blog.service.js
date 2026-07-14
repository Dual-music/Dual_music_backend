import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { sanitizeText } from '../utils/sanitize.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Blog domain service.
 *
 * Blog articles (`blogs`) are admin-authored editorial content. Public reads
 * only ever expose `published = true` articles; staff (admin/moderator) may list
 * and read drafts. Create/update/delete are admin-only (enforced at the route).
 *
 * @module services/blog.service
 */

/**
 * Lists blog articles (newest first). Non-staff callers only ever see published
 * articles regardless of the requested visibility.
 * @param {object} query - `category?`, `published?` ('true'|'false'|'all') + pagination.
 * @param {string[]} [roles] - The caller's roles (for draft visibility).
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listBlogs(query, roles = []) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (isStaff && (query.published === 'all' || query.published === 'false')) {
    if (query.published === 'false') where.published = false;
    // 'all' → no published filter.
  } else {
    where.published = true;
  }
  if (query.category) where.category = query.category;
  const rows = await db.Blog.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a single blog article. Non-staff callers may only read a published one.
 * @param {string} id
 * @param {string[]} [roles]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found or hidden from the caller.
 */
export async function getBlog(id, roles = []) {
  const blog = await db.Blog.findByPk(id, { raw: true });
  if (!blog) throw ApiError.notFound('NOT_FOUND');
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!blog.published && !isStaff) throw ApiError.notFound('NOT_FOUND');
  return blog;
}

/**
 * Resolves the display name to store as `author_name` for a user.
 * @param {string} userId
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
async function resolveAuthorName(userId, fallback = 'Admin') {
  const [profile] = await getDisplayProfiles([userId]);
  return profile?.full_name || fallback;
}

/**
 * Creates a blog article (admin action). Author fields are taken from the caller.
 * @param {{ id: string, email?: string }} user - The authenticated admin.
 * @param {object} input - `{ title, content, excerpt?, imageUrl?, category?, published? }`
 * @returns {Promise<object>}
 */
export async function createBlog(user, input) {
  const authorName = await resolveAuthorName(user.id, user.email || 'Admin');
  return db.Blog.create({
    author_id: user.id,
    author_name: authorName,
    title: sanitizeText(input.title, { maxLength: 255 }),
    content: sanitizeText(input.content, { maxLength: 100000 }),
    excerpt: input.excerpt != null ? sanitizeText(input.excerpt) : null,
    image_url: input.imageUrl ?? null,
    category: input.category ?? 'news',
    published: input.published ?? false,
    views_count: 0,
  });
}

/**
 * Updates a blog article (admin action, whitelisted fields).
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function updateBlog(id, patch) {
  const blog = await db.Blog.findByPk(id);
  if (!blog) throw ApiError.notFound('NOT_FOUND');
  if (patch.title !== undefined) blog.title = sanitizeText(patch.title, { maxLength: 255 });
  if (patch.content !== undefined) blog.content = sanitizeText(patch.content, { maxLength: 100000 });
  if (patch.excerpt !== undefined) blog.excerpt = patch.excerpt != null ? sanitizeText(patch.excerpt) : null;
  if (patch.imageUrl !== undefined) blog.image_url = patch.imageUrl;
  if (patch.category !== undefined) blog.category = patch.category;
  if (patch.published !== undefined) blog.published = patch.published;
  blog.updated_at = new Date();
  await blog.save();
  return blog;
}

/**
 * Soft-deletes a blog article (admin action).
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 * @throws {ApiError} 404 when not found.
 */
export async function deleteBlog(id) {
  const blog = await db.Blog.findByPk(id);
  if (!blog) throw ApiError.notFound('NOT_FOUND');
  const removed = await db.Blog.destroy({ where: { id } });
  return { removed: removed > 0 };
}

/**
 * Increments a blog article's view counter (on article open).
 * @param {string} id
 * @returns {Promise<{ views: number }>}
 * @throws {ApiError} 404 when not found.
 */
export async function incrementViews(id) {
  await db.Blog.increment('views_count', { where: { id }, by: 1 });
  const blog = await db.Blog.findByPk(id, { attributes: ['views_count'], raw: true });
  if (!blog) throw ApiError.notFound('NOT_FOUND');
  return { views: Number(blog.views_count) };
}

export default {
  listBlogs,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog,
  incrementViews,
};
