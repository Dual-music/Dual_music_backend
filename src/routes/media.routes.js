import { Router } from 'express';

import { getStorageDriver } from '../services/storage/index.js';
import { pathFor } from '../services/storage/local.driver.js';
import { isPrivateKey } from '../services/upload.service.js';

/**
 * @file Public media serve router — mounted at `/media` (app root, outside the
 * API prefix so `publicUrl()` yields clean `.../media/<key>` links).
 *
 * Serves **public** objects stored by the `local` driver straight from disk.
 * Private categories (premium replays) are refused here — they are only
 * reachable through the token-signed download route. Path traversal is blocked
 * by re-resolving the key under the storage root ({@link pathFor}).
 *
 * Inert unless `STORAGE_DRIVER=local`.
 *
 * @module routes/media.routes
 */

export const mediaRouter = Router();

mediaRouter.get('/*', (req, res) => {
  if (getStorageDriver().name !== 'local') return res.status(404).end();

  const key = req.params[0] || '';
  if (!key || isPrivateKey(key)) return res.status(403).end();

  let abs;
  try {
    abs = pathFor(key);
  } catch {
    return res.status(404).end();
  }

  // Cache public media aggressively — keys are immutable (nanoid per upload).
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

export default mediaRouter;
