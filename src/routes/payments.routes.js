import { Router } from 'express';
import Joi from 'joi';

import * as paymentsController from '../controllers/payments.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as schemas from '../validations/payments.validation.js';

/**
 * @file Payments router — mounted at `/api/v1/payments`.
 *
 * | Method | Path | Auth | Notes |
 * | --- | --- | --- | --- |
 * | POST | /cinetpay/init | Bearer | {amount, countryCode, phone?} → payment_url |
 * | POST | /moneroo/init | Bearer | {amount, currency, phone?, email?} → checkout_url |
 * | POST | /stripe/credits | Bearer | {amount, currency} → checkout url |
 * | POST | /stripe/subscription | Bearer | {plan: pro|premium} → checkout url |
 * | POST | /apple/verify | Bearer | {transactionId} → settles an already-paid StoreKit purchase (iOS) |
 * | POST | /cinetpay/webhook | public | server-to-server re-check + idempotent credit |
 * | POST | /moneroo/webhook | public | HMAC-verified + idempotent credit |
 * | POST | /stripe/webhook | public | signed event, raw body |
 *
 * @module routes/payments.routes
 */

export const paymentsRouter = Router();

// --- Authenticated init endpoints (Idempotency-Key required: financial) ---
paymentsRouter.post('/cinetpay/init', authenticate(), validate(schemas.cinetpayInitSchema), idempotency(), paymentsController.initCinetpay);
paymentsRouter.post('/moneroo/init', authenticate(), validate(schemas.monerooInitSchema), idempotency(), paymentsController.initMoneroo);
paymentsRouter.post('/stripe/credits', authenticate(), validate(schemas.stripeCreditsSchema), idempotency(), paymentsController.initStripeCredits);
paymentsRouter.post(
  '/stripe/subscription',
  authenticate(),
  validate(schemas.stripeSubscriptionSchema),
  idempotency(),
  paymentsController.initStripeSubscription,
);
// Client-driven settlement (iOS already paid via StoreKit) — not a checkout init,
// but financial/idempotent like the others above.
paymentsRouter.post(
  '/apple/verify',
  authenticate(),
  validate(schemas.appleVerifySchema),
  idempotency(),
  paymentsController.verifyAppleIAP,
);

// --- Public reference data ---
paymentsRouter.get('/cinetpay/countries', paymentsController.cinetpayCountries);

// --- Authenticated: the caller's recharge history ---
paymentsRouter.get('/history', authenticate(), paymentsController.history);

// --- Authenticated: the caller's own transaction by merchant id (receipt) ---
paymentsRouter.get(
  '/transaction',
  authenticate(),
  validate(schemas.transactionByMerchantSchema),
  paymentsController.transactionByMerchant,
);

// --- Admin diagnostics ---
paymentsRouter.get(
  '/cinetpay/transactions',
  authenticate(),
  requireRole('admin'),
  paymentsController.cinetpayTransactions,
);
paymentsRouter.get(
  '/cinetpay/verify',
  authenticate(),
  requireRole('admin'),
  validate({ query: Joi.object({ merchantId: Joi.string().max(120).required() }) }),
  paymentsController.verifyCinetpay,
);

// --- Public, signature-verified webhooks ---
paymentsRouter.post('/cinetpay/webhook', paymentsController.cinetpayWebhook);
paymentsRouter.post('/moneroo/webhook', paymentsController.monerooWebhook);
paymentsRouter.post('/stripe/webhook', paymentsController.stripeWebhook);

export default paymentsRouter;
