import { Router } from 'express';
import Joi from 'joi';

import { authenticate } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as giftService from '../services/gift.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Gifts router — mounted at `/api/v1/gifts`.
 *
 * | Method | Path | Auth | Notes |
 * | --- | --- | --- | --- |
 * | GET | / | public | gift catalog |
 * | GET | /inventory | Bearer | caller's owned gifts |
 * | GET | /top-donor | public | ?duelId= or ?liveId= |
 * | POST | / | admin | create a virtual gift |
 * | PATCH | /:id | admin | update a virtual gift |
 * | DELETE | /:id | admin | delete a virtual gift |
 *
 * (Buying/sending gifts are wallet operations: POST /wallet/gifts/*.)
 *
 * @module routes/gift.routes
 */

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };
const createGiftSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(120).required(),
    price: Joi.number().positive().required(),
    image_url: Joi.string().max(2048).allow('', null),
  }),
};
const updateGiftSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({
    name: Joi.string().trim().min(1).max(120),
    price: Joi.number().positive(),
    image_url: Joi.string().max(2048).allow('', null),
  }).min(1),
};

export const giftRouter = Router();

giftRouter.get('/', async (_req, res) => sendSuccess(res, await giftService.listGifts()));

giftRouter.get('/inventory', authenticate(), async (req, res) =>
  sendSuccess(res, await giftService.getInventory(req.user.id)),
);

giftRouter.get('/top-donor', async (req, res) =>
  sendSuccess(res, await giftService.getTopDonor({ duelId: req.query.duelId, liveId: req.query.liveId })),
);

// --- Admin CRUD ---
giftRouter.post('/', authenticate(), requireRole('admin'), validate(createGiftSchema), async (req, res) =>
  sendSuccess(res, await giftService.createGift(req.body), { status: 201 }),
);

giftRouter.patch('/:id', authenticate(), requireRole('admin'), validate(updateGiftSchema), async (req, res) =>
  sendSuccess(res, await giftService.updateGift(req.params.id, req.body)),
);

giftRouter.delete('/:id', authenticate(), requireRole('admin'), validate(idParam), async (req, res) => {
  await giftService.deleteGift(req.params.id);
  return sendSuccess(res, { success: true });
});

export default giftRouter;
