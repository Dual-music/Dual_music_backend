import * as contentService from '../services/content.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Content-sharing HTTP controllers (thin).
 * @module controllers/content.controller
 */

/** POST /content/:type/:id/share (auth) */
export async function share(req, res) {
  const row = await contentService.recordShare({
    contentType: req.params.type,
    contentId: req.params.id,
    userId: req.user.id,
    platform: req.body.platform,
  });
  return sendSuccess(res, row, { status: 201 });
}

/** GET /content/:type/:id/shares (public) */
export async function shares(req, res) {
  return sendSuccess(res, await contentService.countShares({ contentType: req.params.type, contentId: req.params.id }));
}

export default { share, shares };
