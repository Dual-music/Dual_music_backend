import Joi from 'joi';

/**
 * @file Joi schemas for the replays module.
 * @module validations/replay.validation
 */

const uuid = Joi.string().uuid();

export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const listQuery = {
  query: Joi.object({
    sourceType: Joi.string().valid('duel', 'concert', 'competition'),
    artistId: uuid,
    duelId: uuid,
    competitionId: uuid,
    concertId: uuid,
    duelIds: Joi.string().max(4000),
    competitionIds: Joi.string().max(4000),
    mine: Joi.string().valid('true'),
    isPublic: Joi.string().valid('true', 'false'),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

export const create = {
  body: Joi.object({
    sourceType: Joi.string().valid('duel', 'concert', 'competition').required(),
    eventId: uuid.required(),
    artistId: uuid,
    title: Joi.string().min(1).max(200).required(),
    videoUrl: Joi.string().uri().max(2048).required(),
    thumbnailUrl: Joi.string().uri().max(2048).allow('', null),
    description: Joi.string().max(2000).allow('', null),
    duration: Joi.number().integer().min(0),
    isPremium: Joi.boolean(),
    isPublic: Joi.boolean(),
    replayPrice: Joi.number().min(0),
    recordedDate: Joi.date().iso(),
  }),
};

export const update = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    title: Joi.string().min(1).max(200),
    description: Joi.string().max(2000).allow('', null),
    thumbnail_url: Joi.string().uri().max(2048).allow('', null),
    is_public: Joi.boolean(),
    is_premium: Joi.boolean(),
    replay_price: Joi.number().min(0),
  }).min(1),
};

export default { idParam, listQuery, create, update };
