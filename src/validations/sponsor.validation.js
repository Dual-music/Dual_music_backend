import Joi from 'joi';

/**
 * @file Joi schemas for the sponsors module.
 * @module validations/sponsor.validation
 */

const uuid = Joi.string().uuid();
const eventType = Joi.string().valid('duel', 'concert', 'artist_concert', 'competition');

export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const createTier = {
  body: Joi.object({
    label: Joi.string().min(1).max(120).required(),
    min_seconds: Joi.number().integer().min(0).required(),
    max_seconds: Joi.number().integer().min(Joi.ref('min_seconds')).required(),
    price_credits: Joi.number().min(0).required(),
    is_active: Joi.boolean(),
  }),
};

export const updateTier = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    label: Joi.string().min(1).max(120),
    min_seconds: Joi.number().integer().min(0),
    max_seconds: Joi.number().integer().min(0),
    price_credits: Joi.number().min(0),
    is_active: Joi.boolean(),
  }).min(1),
};

export const createRequest = {
  body: Joi.object({
    eventType: eventType.required(),
    eventId: uuid.required(),
    mediaType: Joi.string().valid('image', 'video').required(),
    mediaUrl: Joi.string().uri().max(2048).required(),
    mediaDurationSeconds: Joi.number().integer().min(1).max(600).required(),
    description: Joi.string().max(1000).allow('', null),
  }),
};

export const listRequests = {
  query: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    eventType,
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

export const reviewRequest = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    rejected_reason: Joi.string().max(500).allow('', null),
  }),
};

export const adVideosQuery = {
  query: Joi.object({ eventId: uuid.required(), eventType: eventType.required() }),
};

export const startAd = {
  body: Joi.object({
    eventId: uuid.required(),
    eventType: Joi.string().valid('duel', 'concert', 'competition', 'live').required(),
    adVideoId: uuid.required(),
  }),
};

export const createAdVideo = {
  body: Joi.object({
    eventId: uuid.required(),
    eventType: eventType.required(),
    title: Joi.string().min(1).max(200).required(),
    videoUrl: Joi.string().uri().max(2048).required(),
    durationSeconds: Joi.number().integer().min(0).max(600),
    isActive: Joi.boolean(),
  }),
};
export const updateAdVideo = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    title: Joi.string().min(1).max(200),
    video_url: Joi.string().uri().max(2048),
    duration_seconds: Joi.number().integer().min(0).max(600),
    is_active: Joi.boolean(),
    event_id: uuid,
    event_type: eventType,
  }).min(1),
};

export const defaultPriceQuery = {
  query: Joi.object({ duration: Joi.number().integer().min(0).max(600).required() }),
};
export const setDeadline = {
  body: Joi.object({
    eventType: eventType.required(),
    eventId: uuid.required(),
    deadline: Joi.date().iso().allow(null),
  }),
};
export const setPrice = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ priceCredits: Joi.number().positive().required() }),
};
export const approveReuse = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    mediaUrl: Joi.string().uri().max(2048).required(),
    durationSeconds: Joi.number().integer().min(1).max(600).required(),
  }),
};

export default {
  idParam,
  createTier,
  updateTier,
  createRequest,
  listRequests,
  reviewRequest,
  adVideosQuery,
  startAd,
  createAdVideo,
  updateAdVideo,
  defaultPriceQuery,
  setDeadline,
  setPrice,
  approveReuse,
};
