/**
 * @file Typed application error carrying a machine code + HTTP status.
 * @module utils/ApiError
 */

/**
 * Operational error thrown by services/controllers. The global error handler
 * turns it into the uniform error envelope `{ error: { code, message, details } }`
 * with a localized message resolved from the i18n catalog.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 400, 401, 403, 404, 409, 422).
   * @param {string} code - Stable machine code (e.g. `WALLET_INSUFFICIENT`), used for i18n + clients.
   * @param {object} [options]
   * @param {Record<string, unknown>} [options.details] - Extra machine-readable context.
   * @param {string} [options.message] - Fallback message when no i18n entry exists.
   * @param {boolean} [options.expose=true] - Whether the message is safe to expose to clients.
   */
  constructor(statusCode, code, { details, message, expose = true } = {}) {
    super(message || code);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  /** @param {string} code @param {object} [opts] */
  static badRequest(code = 'BAD_REQUEST', opts) {
    return new ApiError(400, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static unauthorized(code = 'UNAUTHENTICATED', opts) {
    return new ApiError(401, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static forbidden(code = 'FORBIDDEN', opts) {
    return new ApiError(403, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static notFound(code = 'NOT_FOUND', opts) {
    return new ApiError(404, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static conflict(code = 'CONFLICT', opts) {
    return new ApiError(409, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static unprocessable(code = 'UNPROCESSABLE_ENTITY', opts) {
    return new ApiError(422, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static tooMany(code = 'RATE_LIMITED', opts) {
    return new ApiError(429, code, opts);
  }
  /** @param {string} code @param {object} [opts] */
  static internal(code = 'INTERNAL_ERROR', opts) {
    return new ApiError(500, code, { expose: false, ...opts });
  }
}

export default ApiError;
