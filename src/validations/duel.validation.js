import Joi from 'joi';

/**
 * @file Joi schemas for the duels module.
 * @module validations/duel.validation
 */

const uuid = Joi.string().uuid();

export const listSchema = {
  query: Joi.object({
    status: Joi.string().valid('upcoming', 'live', 'ended'),
    artistId: Joi.string().uuid(),
    managerId: Joi.string().uuid(),
    cursor: Joi.string(),
    limit: Joi.number().min(1).max(100),
    page: Joi.number().min(1),
    pageSize: Joi.number().min(1).max(100),
  }),
};

export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const createSchema = {
  body: Joi.object({
    artist1Id: uuid.required(),
    artist2Id: uuid.required(),
    scheduledTime: Joi.date().iso().allow(null),
    ticketPrice: Joi.number().min(0).default(0),
  }),
};

export const updateSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    status: Joi.string().valid('upcoming', 'live', 'ended'),
    winnerId: uuid.allow(null),
    roomId: Joi.string().max(120).allow(null),
    currentTimerEndsAt: Joi.date().allow(null),
    currentTimerTargetId: Joi.string().uuid().allow(null),
    scheduledTime: Joi.string().allow(null, ''),
  }).min(1),
};

export const requestSchema = {
  body: Joi.object({
    opponentId: uuid.required(),
    proposedDate: Joi.date().iso().allow(null),
    message: Joi.string().max(1000).allow('', null),
    managerId: uuid.allow(null),
  }),
};

export const changeDateSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ proposedDate: Joi.date().iso().allow(null) }),
};

export const respondSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ accept: Joi.boolean().required() }),
};

export default { listSchema, idParam, createSchema, updateSchema, requestSchema, changeDateSchema, respondSchema };
