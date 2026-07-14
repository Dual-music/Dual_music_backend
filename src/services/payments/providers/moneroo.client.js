import { createHmac } from 'node:crypto';

import { config } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/ApiError.js';
import { safeEqual } from '../../../utils/crypto.js';

/**
 * @file Moneroo HTTP client (aggregated Mobile Money / cards — Africa).
 *
 * `initPayment` creates a payment and returns the checkout URL;
 * `verifyPayment` fetches the authoritative status; `verifySignature` validates
 * the webhook HMAC. Secrets come from configuration (`.env.example`).
 *
 * @see https://docs.moneroo.io/
 * @module services/payments/providers/moneroo.client
 */

const BASE = 'https://api.moneroo.io/v1';

/**
 * Initializes a Moneroo payment.
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.currency
 * @param {string} params.description
 * @param {string} params.returnUrl
 * @param {{ email?: string, first_name?: string, last_name?: string, phone?: string }} params.customer
 * @param {Record<string, unknown>} [params.metadata]
 * @returns {Promise<{ id: string, checkoutUrl: string, raw: object }>}
 */
export async function initPayment({ amount, currency, description, returnUrl, customer, metadata = {} }) {
  const res = await fetch(`${BASE}/payments/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.moneroo.secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      description: description || 'Dual Music credits',
      return_url: returnUrl,
      customer: {
        email: customer.email || 'user@dualmusic.app',
        first_name: customer.first_name || 'Dual',
        last_name: customer.last_name || 'Music',
        phone: customer.phone,
      },
      metadata,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const id = data?.data?.id;
  const checkoutUrl = data?.data?.checkout_url;
  if (!res.ok || !id || !checkoutUrl) {
    logger.error({ status: res.status, data }, 'Moneroo init failed');
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', { details: { status: res.status } });
  }
  return { id, checkoutUrl, raw: data };
}

/**
 * Fetches the authoritative status of a Moneroo payment.
 * @param {string} paymentId
 * @returns {Promise<{ success: boolean, status: string, raw: object }>}
 */
export async function verifyPayment(paymentId) {
  const res = await fetch(`${BASE}/payments/${paymentId}/verify`, {
    headers: { Authorization: `Bearer ${config.moneroo.secretKey}`, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  const status = data?.data?.status || 'unknown';
  return { success: status === 'success', status, raw: data };
}

/**
 * Verifies the webhook HMAC signature (constant-time).
 * @param {Buffer|string} rawBody - Exact received body bytes.
 * @param {string} signature - Value of the provider signature header.
 * @returns {boolean}
 */
export function verifySignature(rawBody, signature) {
  if (!config.moneroo.webhookSecret || !signature) return false;
  const expected = createHmac('sha256', config.moneroo.webhookSecret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
    .digest('hex');
  return safeEqual(expected, signature);
}

export default { initPayment, verifyPayment, verifySignature };
