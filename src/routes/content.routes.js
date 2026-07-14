import { Router } from 'express';

import * as contentController from '../controllers/content.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/content.validation.js';

/**
 * @file Content-sharing router — mounted at `/api/v1/content`.
 *
 * POST /:type/:id/share (auth) — record a share ·
 * GET  /:type/:id/shares (public) — share count.
 *
 * @module routes/content.routes
 */

export const contentRouter = Router();

contentRouter.post('/:type/:id/share', authenticate(), validate(v.shareBody), contentController.share);
contentRouter.get('/:type/:id/shares', validate(v.shareParams), contentController.shares);

export default contentRouter;
