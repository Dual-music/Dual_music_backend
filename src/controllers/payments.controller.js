import { logger } from '../config/logger.js';
import * as payments from '../services/payments/payments.service.js';
import { constructEvent } from '../services/payments/providers/stripe.client.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Payments HTTP controllers.
 *
 * Init endpoints are authenticated and return a hosted-checkout URL. Webhook
 * endpoints are public but each verifies provider authenticity (server-to-server
 * re-check for CinetPay, HMAC for Moneroo, signed events for Stripe) before
 * crediting via idempotent stored procedures.
 *
 * @module controllers/payments.controller
 */

/** POST /payments/cinetpay/init */
export async function initCinetpay(req, res) {
  const data = await payments.initCinetpay({ userId: req.user.id, ...req.body });
  return sendSuccess(res, data, { status: 201 });
}

/** POST /payments/moneroo/init */
export async function initMoneroo(req, res) {
  const data = await payments.initMoneroo({ userId: req.user.id, ...req.body });
  return sendSuccess(res, data, { status: 201 });
}

/** POST /payments/stripe/credits */
export async function initStripeCredits(req, res) {
  const data = await payments.initStripeCredits({ userId: req.user.id, ...req.body });
  return sendSuccess(res, data, { status: 201 });
}

/** POST /payments/stripe/subscription */
export async function initStripeSubscription(req, res) {
  const data = await payments.initStripeSubscription({ userId: req.user.id, plan: req.body.plan });
  return sendSuccess(res, data, { status: 201 });
}

/** POST /payments/apple/verify — settles an already-paid StoreKit purchase. */
export async function verifyAppleIAP(req, res) {
  const data = await payments.verifyAppleCredits({ userId: req.user.id, transactionId: req.body.transactionId });
  return sendSuccess(res, data, { status: 201 });
}

/** GET /payments/cinetpay/countries (public) */
export async function cinetpayCountries(_req, res) {
  return sendSuccess(res, await payments.listCinetpayCountries());
}

/** GET /payments/history (auth) — the caller's recharge history. */
export async function history(req, res) {
  return sendSuccess(res, await payments.listMyCreditPurchases(req.user.id, { limit: req.query.limit }));
}

/** GET /payments/transaction?merchantId= (auth) — the caller's own recharge tx (receipt). */
export async function transactionByMerchant(req, res) {
  return sendSuccess(res, await payments.getTransactionByMerchant(req.user.id, req.query.merchantId));
}

/** GET /payments/cinetpay/transactions (admin) — CinetPay payin ledger. */
export async function cinetpayTransactions(req, res) {
  return sendSuccess(res, await payments.listCinetpayTransactions({ limit: req.query.limit }));
}

/** GET /payments/cinetpay/verify?merchantId= (admin) */
export async function verifyCinetpay(req, res) {
  return sendSuccess(res, await payments.verifyCinetpayTransaction(req.query.merchantId));
}

/** POST /payments/cinetpay/webhook (public) */
export async function cinetpayWebhook(req, res) {
  try {
    await payments.handleCinetpayWebhook(req.body);
  } catch (err) {
    logger.error({ err: err.message }, 'CinetPay webhook error');
  }
  // Always ack so the provider stops retrying; settlement is idempotent.
  return res.status(200).send('OK');
}

/** POST /payments/moneroo/webhook (public) */
export async function monerooWebhook(req, res) {
  const signature = req.headers['x-moneroo-signature'] || req.headers['moneroo-signature'] || '';
  await payments.handleMonerooWebhook(req.rawBody, String(signature), req.body);
  return res.status(200).send('OK');
}

/** POST /payments/stripe/webhook (public, raw body) */
export async function stripeWebhook(req, res) {
  const event = constructEvent(req.rawBody, req.headers['stripe-signature']);
  await payments.handleStripeEvent(event);
  return res.status(200).json({ received: true });
}

export default {
  initCinetpay,
  initMoneroo,
  initStripeCredits,
  initStripeSubscription,
  verifyAppleIAP,
  cinetpayCountries,
  history,
  transactionByMerchant,
  cinetpayTransactions,
  verifyCinetpay,
  cinetpayWebhook,
  monerooWebhook,
  stripeWebhook,
};
