import { Router } from 'express';
import Joi from 'joi';

import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as livekitService from '../services/livekit.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file LiveKit router — mounted at `/api/v1/livekit`.
 *
 * `POST /livekit/token` (Bearer) → `{ token, url, identity }`.
 * Accepts the frontend's field names (`roomName`, `isHost`, `participantName`,
 * `canPublish`).
 *
 * @module routes/livekit.routes
 */

const tokenSchema = {
  body: Joi.object({
    roomName: Joi.string().min(1).max(200).required(),
    isHost: Joi.boolean().default(false),
    canPublish: Joi.boolean(),
    participantName: Joi.string().max(120).allow('', null),
    metadata: Joi.object().unknown(true),
  }),
};

export const livekitRouter = Router();

livekitRouter.post('/token', authenticate(), validate(tokenSchema), async (req, res) => {
  const data = await livekitService.issueToken({ userId: req.user.id, ...req.body });
  return sendSuccess(res, data, { status: 201 });
});

export default livekitRouter;
