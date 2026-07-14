import Joi from 'joi';

/**
 * @file Joi schemas for the subscriptions module.
 * @module validations/subscription.validation
 */

const uuid = Joi.string().uuid();

export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const subscribe = {
  body: Joi.object({ plan: Joi.string().valid('pro', 'premium').required() }),
};

export const activate = {
  body: Joi.object({ plan: Joi.string().valid('free', 'pro', 'premium').required() }),
};

export const createPlan = {
  body: Joi.object({
    name: Joi.string().min(1).max(120).required(),
    description: Joi.string().max(1000).allow('', null),
    price: Joi.number().min(0),
    currency: Joi.string().length(3).uppercase(),
    features: Joi.array().items(Joi.string().max(200)),
    rules: Joi.object().unknown(true),
    icon: Joi.string().max(120).allow('', null),
    gradient: Joi.string().max(200).allow('', null),
    sort_order: Joi.number().integer().min(0),
    is_active: Joi.boolean(),
  }),
};

export const updatePlan = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    name: Joi.string().min(1).max(120),
    description: Joi.string().max(1000).allow('', null),
    price: Joi.number().min(0),
    currency: Joi.string().length(3).uppercase(),
    features: Joi.array().items(Joi.string().max(200)),
    rules: Joi.object().unknown(true),
    icon: Joi.string().max(120).allow('', null),
    gradient: Joi.string().max(200).allow('', null),
    sort_order: Joi.number().integer().min(0),
    is_active: Joi.boolean(),
  }).min(1),
};

export default { idParam, subscribe, activate, createPlan, updatePlan };
