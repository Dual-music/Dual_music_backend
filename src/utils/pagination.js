/**
 * @file Pagination helpers — cursor-based by default, offset (page/pageSize) optional.
 * @module utils/pagination
 */

import { Op } from 'sequelize';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Encodes a cursor value (opaque base64url of the created_at+id tuple).
 * @param {{ createdAt: Date|string, id: string }} row
 * @returns {string}
 */
export function encodeCursor(row) {
  const raw = JSON.stringify({ t: new Date(row.createdAt).toISOString(), i: row.id });
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/**
 * Decodes a cursor produced by {@link encodeCursor}.
 * @param {string} cursor
 * @returns {{ t: string, i: string } | null}
 */
export function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Parses pagination query params into Sequelize-ready options.
 *
 * Supports two mutually compatible modes:
 * - Cursor (default): `?cursor=<opaque>&limit=<n>` — stable, keyset pagination.
 * - Offset (optional): `?page=<n>&pageSize=<n>` — convenience for admin tables.
 *
 * @param {Record<string, any>} query - `req.query`.
 * @param {object} [opts]
 * @param {string} [opts.sortColumn='created_at'] - Keyset column (must be indexed).
 * @param {'ASC'|'DESC'} [opts.direction='DESC']
 * @returns {{
 *   mode: 'cursor'|'offset',
 *   limit: number,
 *   where: object,
 *   order: Array<[string, string]>,
 *   offset?: number,
 *   page?: number,
 *   pageSize?: number,
 * }}
 */
export function parsePagination(query = {}, { sortColumn = 'created_at', direction = 'DESC' } = {}) {
  const limit = Math.min(Math.max(Number(query.limit || query.pageSize || DEFAULT_LIMIT), 1), MAX_LIMIT);
  const order = [
    [sortColumn, direction],
    ['id', direction],
  ];

  if (query.page) {
    const page = Math.max(Number(query.page) || 1, 1);
    return { mode: 'offset', limit, where: {}, order, offset: (page - 1) * limit, page, pageSize: limit };
  }

  const where = {};
  if (query.cursor) {
    const decoded = decodeCursor(String(query.cursor));
    if (decoded) {
      const cmp = direction === 'DESC' ? Op.lt : Op.gt;
      where[Op.or] = [
        { [sortColumn]: { [cmp]: decoded.t } },
        { [sortColumn]: decoded.t, id: { [cmp]: decoded.i } },
      ];
    }
  }
  return { mode: 'cursor', limit, where, order };
}

/**
 * Builds the pagination meta object for the response envelope.
 * @param {object} params
 * @param {'cursor'|'offset'} params.mode
 * @param {Array<{ created_at?: Date, createdAt?: Date, id: string }>} params.rows
 * @param {number} params.limit
 * @param {number} [params.total] - Total count (offset mode only).
 * @param {number} [params.page]
 * @returns {object}
 */
export function buildPaginationMeta({ mode, rows, limit, total, page }) {
  if (mode === 'offset') {
    return { page, pageSize: limit, total: total ?? null, totalPages: total != null ? Math.ceil(total / limit) : null };
  }
  const last = rows.length === limit ? rows[rows.length - 1] : null;
  const nextCursor = last
    ? encodeCursor({ createdAt: last.created_at ?? last.createdAt, id: last.id })
    : null;
  return { limit, nextCursor, hasMore: Boolean(nextCursor) };
}

export default { parsePagination, buildPaginationMeta, encodeCursor, decodeCursor };
