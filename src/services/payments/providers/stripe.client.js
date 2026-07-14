import Stripe from 'stripe';

import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * @file Stripe client (card payments + Pro/Premium subscriptions).
 *
 * Lazily constructs the official Stripe SDK. Exposes checkout-session creation
 * for one-off credit purchases and recurring subscriptions, plus signed-webhook
 * event construction (`constructEvent`) which validates the `Stripe-Signature`
 * header against the raw request body.
 *
 * @see https://stripe.com/docs/api
 * @module services/payments/providers/stripe.client
 */

/** @type {Stripe | null} */
let stripe = null;

/**
 * Returns the singleton Stripe SDK instance.
 * @returns {Stripe}
 */
export function getStripe() {
  if (!config.stripe.secretKey) throw ApiError.internal('STRIPE_NOT_CONFIGURED');
  if (!stripe) stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-12-18.acacia' });
  return stripe;
}

/**
 * Creates a Checkout Session for a one-off credit purchase.
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.credits
 * @param {number} params.amount - Amount in the currency's major unit.
 * @param {string} params.currency
 * @param {string} params.successUrl
 * @param {string} params.cancelUrl
 * @returns {Promise<import('stripe').Stripe.Checkout.Session>}
 */
export async function createCreditsCheckout({ userId, credits, amount, currency, successUrl, cancelUrl }) {
  return getStripe().checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: { type: 'credits', user_id: userId, credits: String(credits) },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: { name: `${credits} crédits Dual Music` },
        },
      },
    ],
  });
}

/**
 * Creates a Checkout Session for a Pro/Premium recurring subscription.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.priceId - Stripe recurring price id.
 * @param {string} params.plan - 'pro' | 'premium'.
 * @param {string} params.successUrl
 * @param {string} params.cancelUrl
 * @returns {Promise<import('stripe').Stripe.Checkout.Session>}
 */
export async function createSubscriptionCheckout({ userId, priceId, plan, successUrl, cancelUrl }) {
  return getStripe().checkout.sessions.create({
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: { type: 'subscription', user_id: userId, plan },
    line_items: [{ price: priceId, quantity: 1 }],
  });
}

/**
 * Verifies and parses a Stripe webhook event from the raw request body.
 * @param {Buffer} rawBody
 * @param {string} signature - `Stripe-Signature` header.
 * @returns {import('stripe').Stripe.Event}
 * @throws {ApiError} 400 WEBHOOK_SIGNATURE_INVALID
 */
export function constructEvent(rawBody, signature) {
  try {
    return getStripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    throw ApiError.badRequest('WEBHOOK_SIGNATURE_INVALID', { details: { message: err.message } });
  }
}

export default { getStripe, createCreditsCheckout, createSubscriptionCheckout, constructEvent };
