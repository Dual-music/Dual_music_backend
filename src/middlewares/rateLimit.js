import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { config } from '../config/env.js';
import { getRedis } from '../config/redis.js';

/**
 * @file Rate-limiting middleware factory.
 *
 * Uses a Redis store when available (shared across instances) and transparently
 * falls back to the in-memory store when Redis is disabled in development.
 * Provides a global limiter plus tuned limiters for sensitive routes
 * (login 5/min/IP, OTP 3/10min).
 *
 * @module middlewares/rateLimit
 */

/**
 * Builds a limiter with an optional Redis store.
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.max
 * @param {string} opts.prefix - Redis key prefix / limiter name.
 * @param {(req: import('express').Request) => string} [opts.keyGenerator]
 * @returns {import('express').RequestHandler}
 */
export function makeLimiter({ windowMs, max, prefix, keyGenerator }) {
  // Use the shared Redis store only when Redis is mandatory (production). In
  // optional/dev mode fall back to the in-memory store so no infra is required.
  const redis = config.redis.optional ? null : getRedis();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    store: redis
      ? new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix: `rl:${prefix}:` })
      : undefined,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
        meta: { requestId: res.locals.requestId },
      }),
  });
}

/** Global limiter: 300 requests / minute / IP. */
export const globalLimiter = makeLimiter({ windowMs: 60_000, max: 300, prefix: 'global' });

/** Login limiter: 5 attempts / minute / IP. */
export const loginLimiter = makeLimiter({ windowMs: 60_000, max: 5, prefix: 'login' });

/** OTP limiter: 3 requests / 10 minutes, keyed by phone when provided else IP. */
export const otpLimiter = makeLimiter({
  windowMs: 10 * 60_000,
  max: 3,
  prefix: 'otp',
  keyGenerator: (req) => String(req.body?.phone || req.ip),
});

export default makeLimiter;
