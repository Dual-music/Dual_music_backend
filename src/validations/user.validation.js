import Joi from 'joi';

/**
 * @file Joi schemas for the users/profiles module.
 * @module validations/user.validation
 */

const uuid = Joi.string().uuid();

/** POST /users/display-profiles */
export const displayProfilesSchema = {
  body: Joi.object({ userIds: Joi.array().items(uuid).max(500).required() }),
};

/** GET /users/:id */
export const userIdParam = { params: Joi.object({ id: uuid.required() }) };

/** PATCH /users/me */
export const updateProfileSchema = {
  body: Joi.object({
    full_name: Joi.string().max(120).allow('', null),
    avatar_url: Joi.string().uri().max(2048).allow('', null),
    bio: Joi.string().max(2000).allow('', null),
    social_links: Joi.object().unknown(true),
    is_public: Joi.boolean(),
    country_code: Joi.string().max(4).uppercase(),
    phone: Joi.string().max(32).allow('', null),
    phone_country_code: Joi.string().max(6).allow('', null),
    birth_date: Joi.string().max(20).allow('', null),
    gender: Joi.string().max(20).allow('', null),
  }).min(1),
};

/** PUT /users/me/preferences/currency */
export const setCurrencySchema = {
  body: Joi.object({ currencyCode: Joi.string().length(3).uppercase().required() }),
};

/** PUT /users/me/ui-preferences */
export const uiPreferencesSchema = {
  body: Joi.object({
    topDonorMode: Joi.string().max(50),
    topDonorAnimation: Joi.string().max(50),
    reduceAnimations: Joi.boolean(),
    timezone: Joi.string().max(60),
  }).min(1),
};

export default { displayProfilesSchema, userIdParam, updateProfileSchema, setCurrencySchema, uiPreferencesSchema };
