import Redis from 'ioredis';

import { config } from './env.js';
import { logger } from './logger.js';

/**
 * @file Redis client factory (ioredis).
 *
 * Used for rate limiting, revoked-token blacklist, cached leaderboards (ZSET),
 * and as the BullMQ connection. When `REDIS_OPTIONAL=true` and Redis is
 * unreachable, the app degrades gracefully: consumers must treat `getRedis()`
 * returning `null` as "feature disabled / use fallback" rather than crashing.
 *
 * @module config/redis
 */

/** @type {import('ioredis').Redis | null} */
let client = null;
let attempted = false;

/**
 * Lazily creates (once) and returns the shared Redis client.
 * @returns {import('ioredis').Redis | null} The client, or `null` when disabled/unavailable.
 */
export function getRedis() {
  if (attempted) return client;
  attempted = true;

  const optional = config.redis.optional;
  try {
    client = new Redis(config.redis.url, {
      // Never surface MaxRetriesPerRequestError as an uncaught rejection.
      maxRetriesPerRequest: null,
      // In optional (dev) mode: don't connect until first use and fail fast so a
      // missing Redis never crashes the process or hangs a request.
      lazyConnect: optional,
      enableOfflineQueue: !optional,
      retryStrategy: (times) => (optional && times > 3 ? null : Math.min(times * 200, 2000)),
    });

    client.on('error', (err) => {
      if (config.redis.optional) {
        logger.warn({ err: err.message }, 'Redis unavailable (optional mode) — using fallbacks');
      } else {
        logger.error({ err: err.message }, 'Redis error');
      }
    });
    client.on('connect', () => logger.info('Redis connection established'));
  } catch (err) {
    if (!config.redis.optional) throw err;
    logger.warn({ err }, 'Redis disabled — falling back to in-process implementations');
    client = null;
  }

  return client;
}

/**
 * Creates a dedicated BullMQ-compatible connection (separate from the shared
 * cache client, as BullMQ requires `maxRetriesPerRequest: null`).
 *
 * Actively probes reachability with a bounded `connect()`: in optional (dev)
 * mode an unreachable Redis resolves to `null` (→ in-process job fallback)
 * instead of returning an offline-queuing client that would hang the first
 * `queue.add()` forever. In required mode the connection is returned and the
 * caller keeps the standard BullMQ retry semantics.
 * @returns {Promise<import('ioredis').Redis | null>}
 */
export async function createQueueConnection() {
  const optional = config.redis.optional;
  const conn = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    // In optional mode fail fast: never buffer commands against a dead Redis, and
    // give up reconnecting after a few tries so `connect()` rejects instead of hanging.
    enableOfflineQueue: !optional,
    retryStrategy: (times) => (optional && times > 3 ? null : Math.min(times * 200, 2000)),
  });
  // Swallow connection errors so an unreachable Redis is never an uncaught rejection.
  conn.on('error', (err) => {
    if (optional) logger.warn({ err: err.message }, 'Redis (jobs) unavailable — using in-process fallback');
    else logger.error({ err: err.message }, 'Redis (jobs) error');
  });

  try {
    await conn.connect();
    return conn;
  } catch (err) {
    conn.disconnect();
    if (!optional) throw err;
    logger.warn({ err: err.message }, 'Redis unreachable — background jobs use the in-process cron fallback');
    return null;
  }
}

export default getRedis;
