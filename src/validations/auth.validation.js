import Joi from 'joi';

/**
 * @file Joi schemas for the auth module. Unknown keys are stripped by the
 * `validate` middleware (mass-assignment protection); these schemas define the
 * exact accepted shape of each request body.
 *
 * @module validations/auth.validation
 */

const email = Joi.string().email({ minDomainSegments: 2 }).max(255).lowercase().trim();
const password = Joi.string().min(8).max(128);
const phone = Joi.string().pattern(/^\+?[0-9\s-]{6,20}$/);

/** POST /auth/register */
export const registerSchema = {
  body: Joi.object({
    email: email.required(),
    password: password.required(),
    fullName: Joi.string().max(120).trim().optional(),
    phone: phone.optional().allow(null, ''),
    countryCode: Joi.string().max(4).uppercase().optional(),
    phoneCountryCode: Joi.string().max(6).optional(),
    referralCode: Joi.string().max(32).trim().optional().allow(null, ''),
  }),
};

/** POST /auth/login */
export const loginSchema = {
  body: Joi.object({
    email: email.required(),
    password: Joi.string().max(128).required(),
  }),
};

/** POST /auth/refresh */
export const refreshSchema = {
  body: Joi.object({ refreshToken: Joi.string().required() }),
};

/** POST /auth/logout */
export const logoutSchema = {
  body: Joi.object({ refreshToken: Joi.string().optional() }),
};

/** POST /auth/otp/verify */
export const verifyOtpSchema = {
  body: Joi.object({ code: Joi.string().pattern(/^[0-9]{4,8}$/).required() }),
};

/** POST /auth/password/forgot */
export const forgotPasswordSchema = {
  body: Joi.object({ email: email.required() }),
};

/** POST /auth/password/reset */
export const resetPasswordSchema = {
  body: Joi.object({
    email: email.required(),
    code: Joi.string().pattern(/^[0-9]{4,8}$/).required(),
    newPassword: password.required(),
  }),
};

/** POST /auth/password/change */
export const changePasswordSchema = {
  body: Joi.object({
    currentPassword: Joi.string().max(128).allow('').optional(),
    newPassword: password.required(),
  }),
};

/** GET /auth/oauth/google/callback */
export const googleCallbackSchema = {
  query: Joi.object({
    code: Joi.string().required(),
    state: Joi.string().optional(),
    scope: Joi.string().optional(),
    authuser: Joi.string().optional(),
    prompt: Joi.string().optional(),
  }),
};

/** POST /auth/oauth/google/native */
export const googleNativeSchema = {
  body: Joi.object({ idToken: Joi.string().min(10).max(8192).required() }),
};

export const appleNativeSchema = {
  body: Joi.object({
    identityToken: Joi.string().min(10).max(8192).required(),
    // Fourni par le client SEULEMENT si Apple vient de le donner (première autorisation).
    fullName: Joi.string().max(160).allow('', null),
  }),
};

export default {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  googleCallbackSchema,
  googleNativeSchema,
  appleNativeSchema,
};
