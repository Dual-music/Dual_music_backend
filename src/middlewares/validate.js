import { ApiError } from '../utils/ApiError.js';

/**
 * @file Joi request-validation middleware factory.
 *
 * Validates and (crucially) **replaces** each request part with the coerced,
 * whitelisted value. Unknown keys are stripped, providing mass-assignment
 * protection: only fields declared in the schema ever reach controllers.
 *
 * @module middlewares/validate
 */

/**
 * @typedef {object} ValidationSchemas
 * @property {import('joi').Schema} [body]
 * @property {import('joi').Schema} [query]
 * @property {import('joi').Schema} [params]
 */

const OPTIONS = { abortEarly: false, stripUnknown: true, convert: true };

/**
 * Creates a middleware that validates the given request parts against Joi schemas.
 * @param {ValidationSchemas} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas = {}) {
  const middleware = (req, _res, next) => {
    for (const key of /** @type {const} */ (['params', 'query', 'body'])) {
      const schema = schemas[key];
      if (!schema) continue;
      const { value, error } = schema.validate(req[key], OPTIONS);
      if (error) {
        error.isJoi = true;
        return next(error);
      }
      // `req.query`/`req.params` are read-only getters on some Express versions;
      // assign defensively so coerced values propagate to controllers.
      try {
        req[key] = value;
      } catch {
        Object.defineProperty(req, key, { value, writable: true, configurable: true });
      }
    }
    return next();
  };
  // Expose the schemas so the OpenAPI generator can introspect request shapes.
  middleware.__schemas = schemas;
  return middleware;
}

/**
 * Guards financial POST endpoints requiring an `Idempotency-Key` header.
 * @returns {import('express').RequestHandler}
 */
export function requireIdempotencyKey() {
  return (req, _res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string') {
      return next(ApiError.badRequest('IDEMPOTENCY_KEY_REQUIRED'));
    }
    req.idempotencyKey = key;
    return next();
  };
}

export default validate;
