import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { hmacHash } from '../utils/crypto.js';

/**
 * @file Idempotency middleware for financial POSTs.
 *
 * Enforces the `Idempotency-Key` header and makes the endpoint safe to retry:
 * the first request runs normally and its response is persisted in
 * `idempotency_keys` (scoped by user + key + path); any retry with the **same**
 * key replays the stored response instead of re-executing (no double charge).
 * A retry that reuses a key with a **different** body is rejected (409), and a
 * concurrent in-flight retry is rejected (409) until the first completes.
 *
 * Only 2xx responses are persisted; a failed first attempt clears the record so
 * the client may safely retry.
 *
 * @module middlewares/idempotency
 */

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {import('express').RequestHandler}
 */
export function idempotency() {
  const middleware = async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string') return next(ApiError.badRequest('IDEMPOTENCY_KEY_REQUIRED'));

    const userId = req.user?.id ?? null;
    const path = `${req.baseUrl || ''}${req.path}`;
    const requestHash = hmacHash(JSON.stringify(req.body ?? {}));
    const scope = { user_id: userId, idempotency_key: key, path };

    /** @type {any} */
    let record;
    try {
      const [row, created] = await db.IdempotencyKey.findOrCreate({
        where: scope,
        defaults: { ...scope, method: req.method, request_hash: requestHash, status: 'in_progress', expires_at: new Date(Date.now() + TTL_MS) },
      });
      if (!created) {
        if (row.request_hash !== requestHash) return next(ApiError.conflict('IDEMPOTENCY_KEY_CONFLICT'));
        if (row.status === 'completed') return res.status(row.response_status || 200).json(row.response_body);
        return next(ApiError.conflict('IDEMPOTENCY_IN_PROGRESS'));
      }
      record = row;
    } catch {
      // Unique-constraint race: another request claimed the key first.
      return next(ApiError.conflict('IDEMPOTENCY_IN_PROGRESS'));
    }

    // Capture the outgoing JSON body so it can be replayed on retry.
    let captured;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      captured = body;
      return originalJson(body);
    };
    res.on('finish', () => {
      void (async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300 && captured !== undefined) {
            record.status = 'completed';
            record.response_status = res.statusCode;
            record.response_body = captured;
            record.updated_at = new Date();
            await record.save();
          } else {
            // Failed attempt → free the key for a genuine retry.
            await record.destroy();
          }
        } catch {
          /* best-effort persistence; never affects the response */
        }
      })();
    });

    return next();
  };
  middleware.__idempotent = true;
  return middleware;
}

export default idempotency;
