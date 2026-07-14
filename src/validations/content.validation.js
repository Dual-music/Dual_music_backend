import Joi from 'joi';

/**
 * @file Joi schemas for the content-sharing module.
 * @module validations/content.validation
 */

const uuid = Joi.string().uuid();
const contentParams = Joi.object({ type: Joi.string().max(50).required(), id: uuid.required() });

/** GET /content/:type/:id/shares */
export const shareParams = { params: contentParams };

/** POST /content/:type/:id/share */
export const shareBody = {
  params: contentParams,
  body: Joi.object({ platform: Joi.string().max(50).default('unknown') }),
};

export default { shareParams, shareBody };
