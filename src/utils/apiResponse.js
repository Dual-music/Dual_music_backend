/**
 * @file Helpers producing the platform's uniform response envelopes.
 * @module utils/apiResponse
 */

/**
 * Builds the standard success envelope: `{ data, meta: { requestId, pagination? } }`.
 * @param {import('express').Response} res
 * @param {unknown} data - Payload to return under `data`.
 * @param {object} [options]
 * @param {number} [options.status=200] - HTTP status code.
 * @param {object|null} [options.pagination] - Pagination metadata (cursor/page).
 * @param {Record<string, unknown>} [options.meta] - Additional meta fields.
 * @returns {import('express').Response}
 */
export function sendSuccess(res, data, { status = 200, pagination = null, meta = {} } = {}) {
  return res.status(status).json({
    data,
    meta: {
      requestId: res.locals.requestId,
      ...(pagination ? { pagination } : {}),
      ...meta,
    },
  });
}

/**
 * Builds the standard error envelope: `{ error: { code, message, details? } }`.
 * @param {import('express').Response} res
 * @param {object} params
 * @param {number} params.status - HTTP status code.
 * @param {string} params.code - Machine code.
 * @param {string} params.message - Localized human message.
 * @param {Record<string, unknown>} [params.details]
 * @returns {import('express').Response}
 */
export function sendError(res, { status, code, message, details }) {
  return res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
    meta: { requestId: res.locals.requestId },
  });
}

export default { sendSuccess, sendError };
