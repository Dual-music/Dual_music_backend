import { randomUUID } from 'node:crypto';

/**
 * @file Request correlation-id middleware.
 *
 * Reuses an inbound `x-request-id` when present (trusted proxy / gateway),
 * otherwise generates a UUID. The id is exposed on `res.locals.requestId`,
 * echoed back via the `x-request-id` response header, and attached to logs.
 *
 * @module middlewares/requestId
 */

/**
 * @returns {import('express').RequestHandler}
 */
export function requestId() {
  return (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
    req.id = id;
    res.locals.requestId = id;
    res.setHeader('x-request-id', id);
    next();
  };
}

export default requestId;
