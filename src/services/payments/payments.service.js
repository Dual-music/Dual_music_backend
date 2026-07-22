import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { db } from '../../models/index.js';
import { emitToUser } from '../../realtime/bus.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken } from '../../utils/crypto.js';
import { callProcedure } from '../../utils/procedures.js';
import { claimWebhookEvent, markWebhookProcessed } from '../webhook.service.js';

import { computeCreditsForRecharge } from './pricing.service.js';
import * as cinetpay from './providers/cinetpay.client.js';
import * as moneroo from './providers/moneroo.client.js';
import * as stripe from './providers/stripe.client.js';

/**
 * @file Payments orchestration service.
 *
 * Coordinates credit recharges across CinetPay, Moneroo and Stripe: computes the
 * credit quote, persists a provider transaction row, initializes the hosted
 * checkout, and — on a signature-verified, server-confirmed webhook — settles
 * the purchase via idempotent stored procedures. Also handles Stripe
 * subscriptions (Pro/Premium).
 *
 * @module services/payments/payments.service
 */

/** Builds the CinetPay notify (webhook) URL. */
const cinetpayNotifyUrl = () =>
  config.cinetpay.notifyUrl || `${config.apiBaseUrl}/api/v1/payments/cinetpay/webhook`;
/** Builds the return URL after payment. */
const returnUrl = () => config.cinetpay.returnUrl || `${config.corsOrigins[0]}/wallet`;

/**
 * Lists active CinetPay countries with only the fields safe for public
 * consumption (never leaks the per-country secret key names). Replaces the
 * frontend's former public `supabase.from('cinetpay_countries')` read.
 * @returns {Promise<Array<{ country_code, country_name, currency, phone_prefix, operators }>>}
 */
export async function listCinetpayCountries() {
  return db.CinetpayCountry.findAll({
    where: { is_active: true },
    attributes: ['country_code', 'country_name', 'currency', 'phone_prefix', 'operators'],
    order: [['country_code', 'ASC']],
    raw: true,
  });
}

/**
 * Lists the caller's credit-purchase (recharge) history, newest first. Replaces
 * the frontend's former `supabase.from('credit_purchases').eq('user_id', me)`.
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listMyCreditPurchases(userId, { limit = 50 } = {}) {
  return db.CreditPurchase.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
    raw: true,
  });
}

/**
 * Looks up the caller's own recharge transaction by merchant id across the
 * CinetPay and Moneroo pay-in ledgers, returning a compact receipt view. The
 * lookup is ownership-scoped (`user_id = caller`) so a user only ever sees their
 * own transaction; unknown or foreign ids 404.
 * @param {string} userId
 * @param {string} merchantId - The `merchant_transaction_id` from the redirect.
 * @returns {Promise<{ provider: 'cinetpay'|'moneroo', amount: number, currency: string, credits: number, status: string, created_at: Date }>}
 * @throws {ApiError} 404 when no matching transaction is owned by the caller.
 */
export async function getTransactionByMerchant(userId, merchantId) {
  const cp = await db.CinetpayTransaction.findOne({
    where: { merchant_transaction_id: merchantId, user_id: userId },
    raw: true,
  });
  if (cp) {
    return {
      provider: 'cinetpay',
      amount: Number(cp.amount),
      currency: cp.currency,
      credits: Number(cp.credits_amount),
      status: cp.status,
      created_at: cp.created_at,
    };
  }
  const mo = await db.MonerooTransaction.findOne({
    where: { merchant_transaction_id: merchantId, user_id: userId },
    raw: true,
  });
  if (mo) {
    return {
      provider: 'moneroo',
      amount: Number(mo.amount),
      currency: mo.currency,
      credits: Number(mo.credits_amount),
      status: mo.status,
      created_at: mo.created_at,
    };
  }
  throw ApiError.notFound('NOT_FOUND');
}

/**
 * Admin: lists CinetPay transactions (payin ledger), newest first. Replaces the
 * frontend admin panel's former `supabase.from('cinetpay_transactions')` read.
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listCinetpayTransactions({ limit = 100 } = {}) {
  return db.CinetpayTransaction.findAll({
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(limit) || 100, 200),
    raw: true,
  });
}

/**
 * Initializes a CinetPay recharge and returns the hosted checkout URL.
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount - Gross amount in the country's currency.
 * @param {string} params.countryCode
 * @param {string} [params.phone]
 * @returns {Promise<{ paymentUrl: string, merchantTransactionId: string, credits: number }>}
 */
export async function initCinetpay({ userId, amount, countryCode, phone, paymentMethod }) {
  const country = await db.CinetpayCountry.findOne({ where: { country_code: countryCode, is_active: true } });
  if (!country) throw ApiError.badRequest('BAD_REQUEST', { details: { countryCode: 'unsupported' } });
  // Opérateur Mobile Money : fourni par l'app, sinon 1er opérateur actif du pays.
  const method = paymentMethod || country.operators?.[0]?.code || 'ALL';

  const currency = country.currency;
  const { credits } = await computeCreditsForRecharge(amount, currency, 'cinetpay');
  if (credits <= 0) throw ApiError.badRequest('AMOUNT_INVALID');

  const merchantId = `cp_${randomToken(12)}`;
  const notifyToken = randomToken(24);
  await db.CinetpayTransaction.create({
    merchant_transaction_id: merchantId,
    notify_token: notifyToken,
    user_id: userId,
    amount,
    currency,
    country_code: countryCode,
    payment_method: method,
    phone_number: phone ?? '',
    kind: 'payin',
    status: 'pending',
    credits_amount: credits,
  });

  const profile = await db.Profile.findByPk(userId).catch(() => null);
  const nameParts = String(profile?.full_name || '').trim().split(/\s+/).filter(Boolean);
  const init = await cinetpay.initPayment({
    countryCode,
    transactionId: merchantId,
    amount,
    currency,
    paymentMethod: method,
    notifyToken,
    notifyUrl: cinetpayNotifyUrl(),
    successUrl: returnUrl(),
    failedUrl: returnUrl(),
    designation: `Recharge ${credits} crédits`,
    customer: {
      email: profile?.email || undefined,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || undefined,
      phone,
    },
  });

  await db.CinetpayTransaction.update(
    { raw_init_response: init.raw, updated_at: new Date() },
    { where: { merchant_transaction_id: merchantId } },
  );
  return { paymentUrl: init.paymentUrl, merchantTransactionId: merchantId, credits };
}

/**
 * Initializes a Moneroo recharge.
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.currency
 * @param {string} [params.phone]
 * @param {string} [params.email]
 * @returns {Promise<{ checkoutUrl: string, merchantTransactionId: string, credits: number }>}
 */
export async function initMoneroo({ userId, amount, currency, phone, email }) {
  const { credits } = await computeCreditsForRecharge(amount, currency, 'moneroo');
  if (credits <= 0) throw ApiError.badRequest('AMOUNT_INVALID');

  const merchantId = `mo_${randomToken(12)}`;
  const tx = await db.MonerooTransaction.create({
    merchant_transaction_id: merchantId,
    user_id: userId,
    amount,
    currency,
    phone_number: phone ?? null,
    kind: 'payin',
    status: 'pending',
    credits_amount: credits,
  });

  const init = await moneroo.initPayment({
    amount,
    currency,
    description: `Recharge ${credits} crédits`,
    returnUrl: returnUrl(),
    customer: { email, phone },
    metadata: { merchant_transaction_id: merchantId, user_id: userId },
  });

  tx.moneroo_transaction_id = init.id;
  tx.raw_init_response = init.raw;
  tx.updated_at = new Date();
  await tx.save();
  return { checkoutUrl: init.checkoutUrl, merchantTransactionId: merchantId, credits };
}

/**
 * Creates a Stripe Checkout session for a credit purchase.
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.currency
 * @returns {Promise<{ url: string }>}
 */
export async function initStripeCredits({ userId, amount, currency }) {
  const { credits } = await computeCreditsForRecharge(amount, currency, 'stripe');
  if (credits <= 0) throw ApiError.badRequest('AMOUNT_INVALID');
  const base = config.corsOrigins[0] || config.apiBaseUrl;
  const session = await stripe.createCreditsCheckout({
    userId,
    credits,
    amount,
    currency,
    successUrl: `${base}/wallet?status=success`,
    cancelUrl: `${base}/wallet?status=cancel`,
  });
  return { url: session.url };
}

/**
 * Creates a Stripe subscription checkout (Pro/Premium).
 * @param {object} params
 * @param {string} params.userId
 * @param {'pro'|'premium'} params.plan
 * @returns {Promise<{ url: string }>}
 */
export async function initStripeSubscription({ userId, plan }) {
  const priceId = plan === 'premium' ? config.stripe.pricePremium : config.stripe.pricePro;
  if (!priceId) throw ApiError.badRequest('BAD_REQUEST', { details: { plan: 'price_not_configured' } });
  const base = config.corsOrigins[0] || config.apiBaseUrl;
  const session = await stripe.createSubscriptionCheckout({
    userId,
    priceId,
    plan,
    successUrl: `${base}/profile?sub=success`,
    cancelUrl: `${base}/profile?sub=cancel`,
  });
  return { url: session.url };
}

/**
 * Admin diagnostic: re-checks a CinetPay transaction's status server-to-server
 * (mirrors `cinetpay-verify-tx`). Read-only — does not credit.
 * @param {string} merchantId
 * @returns {Promise<{ merchantTransactionId: string, accepted: boolean, status: string }>}
 */
export async function verifyCinetpayTransaction(merchantId) {
  const tx = await db.CinetpayTransaction.findOne({ where: { merchant_transaction_id: merchantId } });
  if (!tx) throw ApiError.notFound('NOT_FOUND');
  const check = await cinetpay.checkPayment({ countryCode: tx.country_code, transactionId: merchantId });
  return { merchantTransactionId: merchantId, accepted: check.accepted, status: check.status };
}

/**
 * Handles a CinetPay pay-in webhook. Authoritatively re-checks the transaction
 * server-to-server before crediting (never trusts the webhook body alone).
 * @param {Record<string, any>} body - Parsed webhook form/body.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function handleCinetpayWebhook(body) {
  const merchantId = body.cpm_trans_id || body.transaction_id;
  if (!merchantId) throw ApiError.badRequest('BAD_REQUEST');

  // Replay protection: skip an already-settled event.
  const claim = await claimWebhookEvent('cinetpay', merchantId);
  if (!claim.fresh) return { ok: true, replayed: true };

  const tx = await db.CinetpayTransaction.findOne({ where: { merchant_transaction_id: merchantId } });
  if (!tx) throw ApiError.notFound('NOT_FOUND');
  await tx.update({ raw_webhook_payload: body, updated_at: new Date() });

  const check = await cinetpay.checkPayment({ countryCode: tx.country_code, transactionId: merchantId });
  if (!check.accepted) {
    logger.warn({ merchantId, status: check.status }, 'CinetPay payment not accepted');
    return { ok: false };
  }
  const out = await callProcedure(
    'cinetpay_credit_wallet',
    [merchantId, Number(tx.credits_amount)],
    ['ok', 'already', 'error', 'balance'],
  );
  if (!out.ok) throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', { details: { error: out.error } });
  await markWebhookProcessed(claim.record);
  // Credit settled — nudge the buyer so their recharge toast can fire.
  if (!out.already) emitToUser(tx.user_id, 'tx:credit', { amount: Number(tx.credits_amount), currency: tx.currency });
  return { ok: true };
}

/**
 * Handles a Moneroo pay-in webhook (HMAC-verified + status re-checked).
 * @param {Buffer} rawBody
 * @param {string} signature
 * @param {Record<string, any>} body
 * @returns {Promise<{ ok: boolean }>}
 */
export async function handleMonerooWebhook(rawBody, signature, body) {
  if (!moneroo.verifySignature(rawBody, signature)) throw ApiError.badRequest('WEBHOOK_SIGNATURE_INVALID');

  const paymentId = body?.data?.id;
  const claim = await claimWebhookEvent('moneroo', paymentId);
  if (!claim.fresh) return { ok: true, replayed: true };

  const tx = await db.MonerooTransaction.findOne({ where: { moneroo_transaction_id: paymentId } });
  if (!tx) throw ApiError.notFound('NOT_FOUND');
  await tx.update({ raw_webhook_payload: body, updated_at: new Date() });

  const verify = await moneroo.verifyPayment(paymentId);
  if (!verify.success) return { ok: false };

  const out = await callProcedure(
    'moneroo_credit_wallet',
    [tx.merchant_transaction_id, Number(tx.credits_amount)],
    ['ok', 'already', 'error', 'balance'],
  );
  if (!out.ok) throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', { details: { error: out.error } });
  await markWebhookProcessed(claim.record);
  if (!out.already) emitToUser(tx.user_id, 'tx:credit', { amount: Number(tx.credits_amount), currency: tx.currency });
  return { ok: true };
}

/**
 * Handles a verified Stripe webhook event (credits + subscription lifecycle).
 * @param {import('stripe').Stripe.Event} event
 * @returns {Promise<{ ok: boolean }>}
 */
export async function handleStripeEvent(event) {
  // Replay protection keyed on the unique Stripe event id.
  const claim = await claimWebhookEvent('stripe', event.id);
  if (!claim.fresh) return { ok: true, replayed: true };

  const result = await dispatchStripeEvent(event);
  await markWebhookProcessed(claim.record);
  return result;
}

/**
 * Dispatches a verified, de-duplicated Stripe event to its handler.
 * @param {import('stripe').Stripe.Event} event
 * @returns {Promise<{ ok: boolean }>}
 */
async function dispatchStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const meta = session.metadata || {};
      if (meta.type === 'credits') {
        const currency = (session.currency || 'eur').toUpperCase();
        const out = await callProcedure(
          'credit_wallet_stripe',
          [
            meta.user_id,
            session.id,
            Number(meta.credits),
            Number(session.amount_total || 0) / 100,
            currency,
          ],
          ['ok', 'already'],
        );
        if (out.ok && !out.already) emitToUser(meta.user_id, 'tx:credit', { amount: Number(meta.credits), currency });
      } else if (meta.type === 'subscription') {
        await db.FanSubscription.create({
          user_id: meta.user_id,
          subscription_type: meta.plan,
          stripe_subscription_id: session.subscription,
          stripe_customer_id: session.customer,
          is_active: true,
          started_at: new Date(),
        });
      }
      return { ok: true };
    }
    case 'customer.subscription.deleted':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      await db.FanSubscription.update(
        { is_active: sub.status === 'active', expires_at: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null },
        { where: { stripe_subscription_id: sub.id } },
      );
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

export default {
  initCinetpay,
  initMoneroo,
  initStripeCredits,
  initStripeSubscription,
  handleCinetpayWebhook,
  handleMonerooWebhook,
  handleStripeEvent,
};
