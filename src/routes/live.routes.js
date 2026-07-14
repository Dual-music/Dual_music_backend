import { Router } from 'express';
import Joi from 'joi';

import * as liveController from '../controllers/live.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';

import { attachChatRoutes } from './chat.helper.js';

/**
 * @file Lives router — mounted at `/api/v1/lives`.
 *
 * GET / · GET /titles · GET /:id · GET /:id/reports/summary · POST / (artist,
 * start) · POST /:id/end · POST /:id/likes · POST /:id/join ·
 * POST /join-requests/:id/respond · chat (see chat.helper).
 *
 * @module routes/live.routes
 */

const uuid = Joi.string().uuid();
const idParam = { params: Joi.object({ id: uuid.required() }) };
const startSchema = {
  body: Joi.object({
    title: Joi.string().max(200).allow('', null),
    roomId: Joi.string().max(120).allow(null),
    streamUrl: Joi.string().uri().max(2048).allow(null),
  }),
};
const respondJoinSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ status: Joi.string().valid('accepted', 'rejected', 'ended').required() }),
};
const updateStatusSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ status: Joi.string().valid('live', 'ended', 'upcoming').required() }),
};
const titlesSchema = { query: Joi.object({ ids: Joi.string().allow('').default('') }) };

export const liveRouter = Router();

liveRouter.get('/', liveController.list);
liveRouter.get('/titles', validate(titlesSchema), liveController.titles);
liveRouter.post('/', authenticate(), requireRole('artist', 'admin'), validate(startSchema), liveController.start);
liveRouter.post('/join-requests/:id/respond', authenticate(), validate(respondJoinSchema), liveController.respondJoin);
liveRouter.delete('/join-requests/:id', authenticate(), validate(idParam), liveController.cancelJoin);

liveRouter.get('/:id', optionalAuth(), validate(idParam), liveController.getOne);
liveRouter.get('/:id/reports/summary', optionalAuth(), validate(idParam), liveController.reportSummary);
liveRouter.patch('/:id', authenticate(), validate(updateStatusSchema), liveController.updateStatus);
liveRouter.post('/:id/end', authenticate(), validate(idParam), liveController.end);
liveRouter.get('/:id/likes', validate(idParam), liveController.likes);
liveRouter.post('/:id/likes', optionalAuth(), validate(idParam), liveController.like);
liveRouter.get('/:id/join-requests', authenticate(), validate(idParam), liveController.joinRequests);
liveRouter.post('/:id/join', authenticate(), validate(idParam), liveController.join);

attachChatRoutes(liveRouter, 'live');

export default liveRouter;
