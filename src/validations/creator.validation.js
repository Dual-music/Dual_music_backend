import Joi from 'joi';

/**
 * @file Joi schemas for the creator (artist/manager) module.
 * @module validations/creator.validation
 */

const uuid = Joi.string().uuid();

/** POST /artists/requests */
export const applyArtistSchema = {
  body: Joi.object({
    description: Joi.string().min(10).max(2000).required(),
    socialLinks: Joi.object().unknown(true).default({}),
    justificationDocumentUrl: Joi.string().uri().max(2048).allow('', null),
  }),
};

/** POST /managers/requests */
export const applyManagerSchema = {
  body: Joi.object({
    bio: Joi.string().min(10).max(2000).required(),
    experience: Joi.string().min(5).max(2000).required(),
  }),
};

/** GET /artists/requests | /managers/requests */
export const listRequestsSchema = {
  query: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    cursor: Joi.string(),
    limit: Joi.number().min(1).max(100),
    page: Joi.number().min(1),
    pageSize: Joi.number().min(1).max(100),
  }),
};

/** POST /artists/requests/:id/review | /managers/requests/:id/review */
export const reviewRequestSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    approve: Joi.boolean().required(),
    rejectionReason: Joi.string().max(1000).allow('', null),
  }),
};

/** PATCH /artists/me */
export const updateArtistProfileSchema = {
  body: Joi.object({
    stage_name: Joi.string().max(120).allow('', null),
    bio: Joi.string().max(2000).allow('', null),
    avatar_url: Joi.string().uri().max(2048).allow('', null),
    cover_image_url: Joi.string().uri().max(2048).allow('', null),
    social_links: Joi.object().unknown(true),
    is_public: Joi.boolean(),
  }).min(1),
};

/** GET /managers/:id — public manager profile by user id. */
export const managerByIdSchema = {
  params: Joi.object({ id: uuid.required() }),
};

/** PATCH /managers/me */
export const updateManagerProfileSchema = {
  body: Joi.object({
    display_name: Joi.string().max(120).allow('', null),
    bio: Joi.string().max(2000).allow('', null),
    experience: Joi.string().max(2000).allow('', null),
    avatar_url: Joi.string().uri().max(2048).allow('', null),
    cover_image_url: Joi.string().uri().max(2048).allow('', null),
    social_links: Joi.object().unknown(true),
    is_public: Joi.boolean(),
  }).min(1),
};

export default {
  applyArtistSchema,
  applyManagerSchema,
  listRequestsSchema,
  reviewRequestSchema,
  updateArtistProfileSchema,
  managerByIdSchema,
  updateManagerProfileSchema,
};
