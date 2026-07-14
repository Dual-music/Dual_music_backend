import Joi from 'joi';

/**
 * @file Joi schemas for the notifications module.
 * @module validations/notification.validation
 */

const uuid = Joi.string().uuid();

export const listQuery = {
  query: Joi.object({
    read: Joi.string().valid('true', 'false'),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const updateEmailPrefs = {
  body: Joi.object({
    email_assignments: Joi.boolean(),
    email_concerts: Joi.boolean(),
    email_duels: Joi.boolean(),
    email_gifts: Joi.boolean(),
    email_lives: Joi.boolean(),
    email_requests: Joi.boolean(),
    email_system: Joi.boolean(),
    email_votes: Joi.boolean(),
  }).min(1),
};

export const subscribePush = {
  body: Joi.object({
    endpoint: Joi.string().uri().max(2048).required(),
    p256dh: Joi.string().max(512).required(),
    auth: Joi.string().max(512).required(),
  }),
};

export const unsubscribePush = {
  body: Joi.object({ endpoint: Joi.string().uri().max(2048).required() }),
};

export default { listQuery, idParam, updateEmailPrefs, subscribePush, unsubscribePush };
