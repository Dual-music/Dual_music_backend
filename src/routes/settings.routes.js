import { Router } from 'express';

import * as settingsService from '../services/settings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Public platform-settings router — mounted at `/api/v1/settings`.
 *
 * Read-only, unauthenticated access to an allow-listed subset of
 * `platform_settings` (see `settings.service.js`). Replaces the frontend's
 * former public `supabase.from('platform_settings').select('value')` reads.
 *
 * | Method | Path | Auth | Notes |
 * | --- | --- | --- | --- |
 * | GET | /settings/public | public | `?keys=a,b` → `{ a: value, b: value }` |
 * | GET | /settings/public/:key | public | single allow-listed key → `{ key, value }` |
 *
 * @module routes/settings.routes
 */

export const settingsRouter = Router();

/** GET /settings/public?keys=economic_config,vote_config */
settingsRouter.get('/public', async (req, res) => {
  const keys = typeof req.query.keys === 'string' && req.query.keys.length
    ? req.query.keys.split(',').map((k) => k.trim()).filter(Boolean)
    : undefined;
  return sendSuccess(res, await settingsService.getPublicSettings(keys));
});

/** GET /settings/exchange-rates — public USD-pivot exchange-rate table. */
settingsRouter.get('/exchange-rates', async (_req, res) => {
  return sendSuccess(res, await settingsService.getExchangeRates());
});

/** GET /settings/public/:key */
settingsRouter.get('/public/:key', async (req, res) => {
  const value = await settingsService.getPublicSetting(req.params.key);
  return sendSuccess(res, { key: req.params.key, value });
});

export default settingsRouter;
