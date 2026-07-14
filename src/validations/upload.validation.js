import Joi from 'joi';

/**
 * @file Joi schemas for the uploads module.
 * @module validations/upload.validation
 */

export const presignUpload = {
  body: Joi.object({
    category: Joi.string()
      .valid('avatar', 'image', 'video', 'lifestyle', 'replay', 'sponsor', 'attachment')
      .required(),
    filename: Joi.string().max(255).required(),
    contentType: Joi.string().max(120).required(),
    size: Joi.number().integer().min(1).max(2 * 1024 * 1024 * 1024),
  }),
};

export const presignDownload = {
  body: Joi.object({ key: Joi.string().min(1).max(1024).required() }),
};

export const confirm = {
  body: Joi.object({ key: Joi.string().min(1).max(1024).required() }),
};

export default { presignUpload, presignDownload, confirm };
