import { Router } from 'express';
import Joi from 'joi';

import * as competitionController from '../controllers/competition.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';

import { attachChatRoutes } from './chat.helper.js';

/**
 * @file Competitions router — mounted at `/api/v1/competitions`.
 *
 * GET / · POST / (manager) · GET /:id · GET /:id/candidates ·
 * POST /:id/publish|apply|performer|focus|finalize|vote|gifts|tickets ·
 * POST /candidates/:id/review (manager) · chat sub-resource.
 *
 * @module routes/competition.routes
 */

const uuid = Joi.string().uuid();
const idParam = { params: Joi.object({ id: uuid.required() }) };

// Venue + eligibility fields (accepted as camelCase → persisted snake_case).
const venueFields = {
  coverUrl: Joi.string().uri().max(2048).allow('', null),
  country: Joi.string().max(100).allow('', null),
  city: Joi.string().max(100).allow('', null),
  commune: Joi.string().max(100).allow('', null),
  district: Joi.string().max(100).allow('', null),
  venueName: Joi.string().max(200).allow('', null),
  venueAddress: Joi.string().max(2000).allow('', null),
  venueContact: Joi.string().max(200).allow('', null),
  eligibilityScope: Joi.string().max(50).allow('', null),
  eligibleCountries: Joi.string().max(2000).allow('', null),
  applicationOpensAt: Joi.date().iso().allow(null),
  managerId: uuid.allow(null),
};
const createSchema = {
  body: Joi.object({
    title: Joi.string().max(200).required(),
    description: Joi.string().max(4000).allow('', null),
    mode: Joi.string().max(20),
    startAt: Joi.date().iso().allow(null),
    endAt: Joi.date().iso().allow(null),
    applicationDeadline: Joi.date().iso().allow(null),
    maxCandidates: Joi.number().integer().min(1).allow(null),
    entryFeeRequired: Joi.boolean(),
    entryFeeAmount: Joi.number().min(0),
    viewerTicketPrice: Joi.number().min(0),
    isPublicPaid: Joi.boolean(),
    rewardAmount: Joi.number().min(0),
    rewardDescription: Joi.string().max(2000).allow('', null),
    ...venueFields,
  }),
};
const updateSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    title: Joi.string().max(200),
    description: Joi.string().max(4000).allow('', null),
    mode: Joi.string().max(20),
    startAt: Joi.date().iso().allow(null),
    endAt: Joi.date().iso().allow(null),
    applicationDeadline: Joi.date().iso().allow(null),
    maxCandidates: Joi.number().integer().min(1).allow(null),
    entryFeeRequired: Joi.boolean(),
    entryFeeAmount: Joi.number().min(0),
    viewerTicketPrice: Joi.number().min(0),
    isPublicPaid: Joi.boolean(),
    rewardAmount: Joi.number().min(0),
    rewardDescription: Joi.string().max(2000).allow('', null),
    status: Joi.string().valid('draft', 'published', 'live', 'finished', 'cancelled'),
    ...venueFields,
  }).min(1),
};
const mineSchema = {
  query: Joi.object({
    status: Joi.string().max(20),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};
const applySchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ pitch: Joi.string().max(2000).allow('', null), videoDemoUrl: Joi.string().uri().max(2048).allow('', null) }),
};
const reviewSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ approve: Joi.boolean().required(), rejectionReason: Joi.string().max(1000).allow('', null) }),
};
const performerSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ candidateId: uuid.allow(null), durationSec: Joi.number().integer().min(0) }),
};
const focusSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ participantId: uuid.allow(null) }),
};
const voteSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ candidateId: uuid.required(), credits: Joi.number().integer().min(1).required() }),
};
const giftSchema = {
  params: Joi.object({ id: uuid.required() }),
  // Recipient is either a candidate or the competition manager — exactly one.
  body: Joi.object({
    candidateId: uuid,
    recipientUserId: uuid,
    giftId: uuid.required(),
    credits: Joi.number().integer().min(1).required(),
  }).xor('candidateId', 'recipientUserId'),
};

export const competitionRouter = Router();

competitionRouter.get('/', competitionController.list);
competitionRouter.post('/', authenticate(), requireRole('manager', 'admin'), validate(createSchema), competitionController.create);
competitionRouter.get('/mine', authenticate(), requireRole('manager', 'admin'), validate(mineSchema), competitionController.mine);
competitionRouter.get('/candidacies/mine', authenticate(), competitionController.myCandidacies);
competitionRouter.get('/tickets/mine', authenticate(), competitionController.myTickets);
competitionRouter.post('/candidates/:id/review', authenticate(), validate(reviewSchema), competitionController.reviewCandidate);

competitionRouter.get('/:id', optionalAuth(), validate(idParam), competitionController.getOne);
competitionRouter.patch('/:id', authenticate(), requireRole('manager', 'admin'), validate(updateSchema), competitionController.update);
competitionRouter.get('/:id/my-ticket', authenticate(), validate(idParam), competitionController.myTicket);
competitionRouter.get('/:id/candidates', validate(idParam), competitionController.candidates);
competitionRouter.post('/:id/publish', authenticate(), validate(idParam), competitionController.publish);
competitionRouter.post('/:id/apply', authenticate(), requireRole('artist', 'admin'), validate(applySchema), competitionController.apply);
competitionRouter.post('/:id/performer', authenticate(), validate(performerSchema), competitionController.setPerformer);
competitionRouter.post('/:id/focus', authenticate(), validate(focusSchema), competitionController.setFocus);
competitionRouter.post('/:id/finalize', authenticate(), validate(idParam), competitionController.finalize);
competitionRouter.post('/:id/vote', authenticate(), validate(voteSchema), competitionController.vote);
competitionRouter.post('/:id/gifts', authenticate(), validate(giftSchema), competitionController.gift);
competitionRouter.post('/:id/tickets', authenticate(), validate(idParam), competitionController.ticket);

attachChatRoutes(competitionRouter, 'competition');

export default competitionRouter;
