import { Router } from 'express';

import { getStorageDriver } from '../services/storage/index.js';
import { pathFor, saveStream, verifyToken } from '../services/storage/local.driver.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file Local storage transport router — mounted at `/api/v1/uploads/local`.
 *
 * Backs the `local` storage driver: the presigned upload/download URLs it issues
 * point here. Authorization is the **signed token** in the path (not the session),
 * so these routes are intentionally mounted *before* the authenticated
 * `/uploads` router. Each token pins a single object key + operation + expiry.
 *
 *   PUT /:token  (op=put) → streams the request body to disk under the key.
 *   GET /:token  (op=get) → serves a private object (premium replays).
 *
 * Inert unless `STORAGE_DRIVER=local` (no tokens are ever issued otherwise).
 *
 * @module routes/localStorage.routes
 */

export const localStorageRouter = Router();

/** 404 the whole router when the local driver is not active. */
localStorageRouter.use((req, res, next) => {
  if (getStorageDriver().name !== 'local') return next('router');
  return next();
});

localStorageRouter.put('/:token', async (req, res, next) => {
  try {
    const data = verifyToken(req.params.token);
    if (!data || data.op !== 'put') throw ApiError.forbidden('FORBIDDEN');
    await saveStream(data.key, req);
    return res.status(200).json({ ok: true, key: data.key });
  } catch (err) {
    return next(err);
  }
});

localStorageRouter.get('/:token', (req, res, next) => {
  try {
    const data = verifyToken(req.params.token);
    if (!data || data.op !== 'get') throw ApiError.forbidden('FORBIDDEN');
    return res.sendFile(pathFor(data.key), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch (err) {
    return next(err);
  }
});

export default localStorageRouter;
