import { config } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * @file CinetPay HTTP client (Mobile Money — West/Central Africa).
 *
 * Wraps the CinetPay v2 REST API: `initPayment` creates a hosted checkout and
 * returns its URL; `checkPayment` performs the server-to-server verification
 * used to authoritatively settle a webhook (never trust the webhook body alone).
 * Credentials come from configuration and are documented in `.env.example`.
 *
 * @see https://docs.cinetpay.com/
 * @module services/payments/providers/cinetpay.client
 */

const BASE = 'https://api-checkout.cinetpay.com/v2';

/**
 * Initializes a CinetPay payment and returns the hosted checkout URL.
 * @param {object} params
 * @param {string} params.transactionId - Our `merchant_transaction_id`.
 * @param {number} params.amount
 * @param {string} params.currency - e.g. 'XOF'.
 * @param {string} params.description
 * @param {string} params.notifyUrl
 * @param {string} params.returnUrl
 * @param {string} [params.channels='ALL']
 * @param {{ name?: string, surname?: string, phone?: string, email?: string }} [params.customer]
 * @returns {Promise<{ paymentUrl: string, paymentToken: string, raw: object }>}
 */
export async function initPayment({
  transactionId,
  amount,
  currency,
  description,
  notifyUrl,
  returnUrl,
  channels = 'ALL',
  customer = {},
}) {
  const body = {
    apikey: config.cinetpay.apiKey,
    site_id: config.cinetpay.siteId,
    transaction_id: transactionId,
    amount,
    currency,
    description: description?.slice(0, 255) || 'Dual Music credits',
    notify_url: notifyUrl,
    return_url: returnUrl,
    channels,
    customer_name: customer.name || 'Dual',
    customer_surname: customer.surname || 'Music',
    customer_phone_number: customer.phone || '',
    customer_email: customer.email || '',
  };

  const res = await fetch(`${BASE}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== '201' || !data.data?.payment_url) {
    logger.error({ code: data.code, message: data.message }, 'CinetPay init failed');
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', { details: { code: data.code, message: data.message } });
  }
  return { paymentUrl: data.data.payment_url, paymentToken: data.data.payment_token, raw: data };
}

/**
 * Verifies a transaction's final status server-to-server.
 * @param {string} transactionId - Our `merchant_transaction_id`.
 * @returns {Promise<{ accepted: boolean, status: string, raw: object }>}
 */
export async function checkPayment(transactionId) {
  const res = await fetch(`${BASE}/payment/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: config.cinetpay.apiKey,
      site_id: config.cinetpay.siteId,
      transaction_id: transactionId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const status = data?.data?.status || 'UNKNOWN';
  return { accepted: status === 'ACCEPTED', status, raw: data };
}

export default { initPayment, checkPayment };
