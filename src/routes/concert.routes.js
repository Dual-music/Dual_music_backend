import { Router } from 'express';
import Joi from 'joi';

import * as concertController from '../controllers/concert.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';

import { attachChatRoutes } from './chat.helper.js';

/**
 * @file Concert routers — `/api/v1/concerts` (admin) and `/api/v1/artist-concerts`.
 *
 * concerts: GET / · GET /:id · POST / (admin) · chat sub-resource.
 * artist-concerts: GET / (approved) · POST / (artist) · POST /:id/review (admin).
 *
 * @module routes/concert.routes
 */

const uuid = Joi.string().uuid();

const createConcertSchema = {
  body: Joi.object({
    artistName: Joi.string().max(200).required(),
    title: Joi.string().max(200).required(),
    description: Joi.string().max(4000).allow('', null),
    scheduledDate: Joi.date().iso().required(),
    scheduledTime: Joi.string().max(20).allow('', null),
    location: Joi.string().max(255).allow('', null),
    ticketPrice: Joi.number().min(0).default(0),
    maxTickets: Joi.number().integer().min(1).allow(null),
    imageUrl: Joi.string().uri().max(2048).allow('', null),
  }),
};

const createArtistConcertSchema = {
  body: Joi.object({
    title: Joi.string().max(200).required(),
    description: Joi.string().max(4000).allow('', null),
    scheduledDate: Joi.date().iso().required(),
    ticketPrice: Joi.number().min(0).default(0),
    maxTickets: Joi.number().integer().min(1).allow(null),
    coverImageUrl: Joi.string().uri().max(2048).allow('', null),
    allowsDedications: Joi.boolean(),
    allowsSponsorAds: Joi.boolean(),
  }),
};

const updateArtistConcertSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    title: Joi.string().max(200),
    description: Joi.string().max(4000).allow('', null),
    scheduledDate: Joi.date().iso(),
    ticketPrice: Joi.number().min(0),
    maxTickets: Joi.number().integer().min(1).allow(null),
    coverImageUrl: Joi.string().uri().max(2048).allow('', null),
    allowsDedications: Joi.boolean(),
    allowsSponsorAds: Joi.boolean(),
    status: Joi.string().valid('upcoming', 'live', 'ended', 'cancelled'),
    recordingUrl: Joi.string().uri().max(2048).allow('', null),
    isReplayAvailable: Joi.boolean(),
  }).min(1),
};

const updateConcertSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    status: Joi.string().valid('upcoming', 'live', 'ended', 'cancelled'),
    recordingUrl: Joi.string().uri().max(2048).allow('', null),
    isReplayAvailable: Joi.boolean(),
  }).min(1),
};

const reviewSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ approve: Joi.boolean().required(), rejectionReason: Joi.string().max(1000).allow('', null) }),
};

const concertType = Joi.string().valid('artist_concert', 'artist_live');
const dedicationSchema = {
  body: Joi.object({
    concertId: uuid.required(),
    concertType: concertType.required(),
    message: Joi.string().min(3).max(500).required(),
    priceCredits: Joi.number().positive().required(),
  }),
};
const dedicationListSchema = { query: Joi.object({ concertId: uuid.required(), concertType: concertType.required() }) };
const idParam = { params: Joi.object({ id: uuid.required() }) };

export const concertRouter = Router();
concertRouter.get('/', concertController.list);
concertRouter.post('/', authenticate(), requireRole('admin'), validate(createConcertSchema), concertController.create);
concertRouter.patch('/:id', authenticate(), requireRole('admin'), validate(updateConcertSchema), concertController.update);

// --- Dedications (registered before /:id so 'dedications' is not read as an id)
concertRouter.post('/dedications', authenticate(), validate(dedicationSchema), idempotency(), concertController.purchaseDedication);
concertRouter.get('/dedications/me', authenticate(), concertController.myDedications);
concertRouter.get('/dedications/artist/me', authenticate(), concertController.artistDedications);
concertRouter.get('/dedications', authenticate(), validate(dedicationListSchema), concertController.listDedications);
concertRouter.post('/dedications/:id/deliver', authenticate(), validate(idParam), concertController.deliverDedication);

concertRouter.get('/:id/ticket-info', optionalAuth(), validate(idParam), concertController.ticketInfo);
// Per-user concert reminder toggle (static sub-path before dynamic `/:id`).
concertRouter.get('/:id/reminder', authenticate(), validate(idParam), concertController.getReminder);
concertRouter.put('/:id/reminder', authenticate(), validate(idParam), concertController.setReminder);
concertRouter.delete('/:id/reminder', authenticate(), validate(idParam), concertController.removeReminder);

concertRouter.get('/:id', optionalAuth(), concertController.getOne);
attachChatRoutes(concertRouter, 'concert');

export const artistConcertRouter = Router();
artistConcertRouter.get('/', concertController.listArtist);
// Static sub-paths must precede any dynamic `/:id` handler.
artistConcertRouter.get('/titles', concertController.artistConcertTitles);
artistConcertRouter.get('/me', authenticate(), concertController.myArtistConcerts);
artistConcertRouter.get('/:id', optionalAuth(), validate(idParam), concertController.getArtistConcert);
artistConcertRouter.post(
  '/',
  authenticate(),
  requireRole('artist', 'admin'),
  validate(createArtistConcertSchema),
  concertController.createArtist,
);
artistConcertRouter.patch(
  '/:id',
  authenticate(),
  requireRole('artist', 'admin'),
  validate(updateArtistConcertSchema),
  concertController.updateArtist,
);
artistConcertRouter.delete(
  '/:id',
  authenticate(),
  requireRole('artist', 'admin'),
  validate(idParam),
  concertController.removeArtist,
);
artistConcertRouter.post(
  '/:id/review',
  authenticate(),
  requireRole('admin'),
  validate(reviewSchema),
  concertController.reviewArtist,
);

export default { concertRouter, artistConcertRouter };
