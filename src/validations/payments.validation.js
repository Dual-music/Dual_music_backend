import Joi from 'joi';

/**
 * @file Joi schemas for the payments module.
 * @module validations/payments.validation
 */

/** POST /payments/cinetpay/init */
export const cinetpayInitSchema = {
  body: Joi.object({
    amount: Joi.number().integer().min(1).required(),
    countryCode: Joi.string().max(4).uppercase().required(),
    phone: Joi.string().max(20).allow('', null),
    // Opérateur Mobile Money (code d'un des `operators` du pays) ; optionnel : le
    // serveur retombe sur le 1er opérateur actif du pays si absent.
    paymentMethod: Joi.string().max(32).allow('', null),
  }),
};

/** POST /payments/moneroo/init */
export const monerooInitSchema = {
  body: Joi.object({
    amount: Joi.number().integer().min(1).required(),
    currency: Joi.string().length(3).uppercase().required(),
    phone: Joi.string().max(20).allow('', null),
    email: Joi.string().email().allow('', null),
  }),
};

/** POST /payments/stripe/credits */
export const stripeCreditsSchema = {
  body: Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().length(3).uppercase().default('EUR'),
  }),
};

/** POST /payments/stripe/subscription */
export const stripeSubscriptionSchema = {
  body: Joi.object({ plan: Joi.string().valid('pro', 'premium').required() }),
};

/**
 * POST /payments/apple/verify — only the transaction id: `productId`/`credits`
 * are NEVER taken from the client, they're re-derived from Apple's own signed
 * response (see `payments.service.js#verifyAppleCredits`).
 */
export const appleVerifySchema = {
  body: Joi.object({ transactionId: Joi.string().max(120).required() }),
};

/** GET /payments/transaction?merchantId= */
export const transactionByMerchantSchema = {
  query: Joi.object({ merchantId: Joi.string().max(120).required() }),
};

export default {
  cinetpayInitSchema,
  monerooInitSchema,
  stripeCreditsSchema,
  stripeSubscriptionSchema,
  appleVerifySchema,
  transactionByMerchantSchema,
};
