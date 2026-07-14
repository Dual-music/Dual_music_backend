import { Router } from 'express';
import Joi from 'joi';

import * as referralController from '../controllers/referral.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';

/**
 * @file Referrals router — mounted at `/api/v1/referrals`.
 *
 * `GET /config` is public (feeds the signup form). `GET /me` and
 * `POST /:id/claim` are user-scoped. Reward crediting is atomic + idempotent
 * (`claim_referral_reward`).
 *
 * @module routes/referral.routes
 */

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };

export const referralRouter = Router();

referralRouter.get('/config', referralController.config);
referralRouter.get('/me', authenticate(), referralController.myReferrals);
referralRouter.post('/:id/claim', authenticate(), validate(idParam), referralController.claim);

export default referralRouter;
