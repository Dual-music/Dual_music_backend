import { ValidationError as SequelizeValidationError, UniqueConstraintError } from 'sequelize';

import { logger } from '../config/logger.js';
import { resolveMessage } from '../i18n/messages.js';
import { ApiError } from '../utils/ApiError.js';
import { sendError } from '../utils/apiResponse.js';

/**
 * @file Global error handler — the single place that turns any thrown error into
 * the uniform `{ error: { code, message, details } }` envelope with a localized
 * message. Works together with `express-async-errors` so async route handlers
 * can simply `throw`.
 *
 * @module middlewares/errorHandler
 */

/**
 * Normalizes a Joi validation error into machine-readable field details.
 * @param {import('joi').ValidationError} err
 * @returns {Record<string, string>}
 */
function joiDetails(err) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const d of err.details) out[d.path.join('.')] = d.message;
  return out;
}

/**
 * Express error-handling middleware (must keep its 4-arg signature).
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 * @returns {import('express').Response}
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const lang = req.lang || 'fr';

  // 1. Known operational errors.
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error({ err, code: err.code }, 'Operational server error');
    return sendError(res, {
      status: err.statusCode,
      code: err.code,
      message: err.expose ? resolveMessage(err.code, lang, err.message) : resolveMessage('INTERNAL_ERROR', lang),
      details: err.expose ? err.details : undefined,
    });
  }

  // 2. Joi validation errors (thrown by the validate middleware).
  if (err && err.isJoi) {
    return sendError(res, {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: resolveMessage('VALIDATION_ERROR', lang),
      details: joiDetails(err),
    });
  }

  // 3. Sequelize constraint / validation errors.
  if (err instanceof UniqueConstraintError) {
    return sendError(res, {
      status: 409,
      code: 'CONFLICT',
      message: resolveMessage('CONFLICT', lang),
      details: { fields: err.fields ? Object.keys(err.fields) : undefined },
    });
  }
  if (err instanceof SequelizeValidationError) {
    return sendError(res, {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: resolveMessage('VALIDATION_ERROR', lang),
      details: Object.fromEntries(err.errors.map((e) => [e.path, e.message])),
    });
  }

  // 4. Unknown / programming errors — never leak internals.
  logger.error({ err }, 'Unhandled error');
  return sendError(res, {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: resolveMessage('INTERNAL_ERROR', lang),
  });
}

/**
 * 404 handler for unmatched routes.
 * @returns {import('express').RequestHandler}
 */
export function notFoundHandler() {
  return (req, res) =>
    sendError(res, {
      status: 404,
      code: 'NOT_FOUND',
      message: resolveMessage('NOT_FOUND', req.lang || 'fr'),
      details: { path: req.originalUrl },
    });
}

export default errorHandler;
