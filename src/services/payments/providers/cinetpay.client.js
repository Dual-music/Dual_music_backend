import { config } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * @file Client CinetPay — **nouvelle API v1** (Mobile Money, Afrique de l'Ouest/Centrale).
 *
 * Portage fidèle de l'intégration Supabase éprouvée (`_shared/cinetpay.ts`) :
 *   - Auth   : `POST {base}/v1/oauth/login { api_key, api_password }` → `{ access_token }`
 *   - PayIn  : `POST {base}/v1/payment` (Bearer) → `{ data: { payment_url, ... } }`
 *   - Statut : `GET  {base}/v1/payment/{merchant_transaction_id}` (Bearer)
 *
 * Base auto-détectée selon le préfixe de la clé : `sk_test_*` → sandbox
 * (`https://api.cinetpay.net`), `sk_live_*` → prod (`https://api.cinetpay.co`).
 * Override possible via `CINETPAY_BASE_URL`.
 *
 * ⚠️ CinetPay applique une **liste blanche d'IP** : l'IP sortante du backend doit être
 * autorisée dans le compte marchand. En cas de rejet, l'IP détectée est remontée dans
 * l'erreur pour faciliter le whitelisting.
 *
 * Multi-pays : un compte = un pays. Les identifiants par pays viennent de
 * `config.cinetpay.accounts[countryCode]`, avec repli sur le compte par défaut
 * (`CINETPAY_API_KEY` / `CINETPAY_API_PASSWORD`).
 *
 * @module services/payments/providers/cinetpay.client
 */

const DEFAULT_BASE = 'https://api.cinetpay.net';

/** Cache mémoire des tokens d'accès (par pays), ~45 min. */
const tokenCache = new Map();

/** Identifiants (api_key + api_password) pour un pays, avec repli sur le compte par défaut. */
function credentialsFor(countryCode) {
  const acc = config.cinetpay.accounts?.[countryCode];
  const key = acc?.key || config.cinetpay.apiKey;
  const password = acc?.password || config.cinetpay.apiPassword;
  if (!key || !password) {
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', {
      details: { message: `Identifiants CinetPay manquants pour ${countryCode}` },
    });
  }
  return { key, password };
}

/** Base API selon le préfixe de clé (sandbox/prod), ou l'override d'environnement. */
function baseForKey(key) {
  if (config.cinetpay.baseUrl) return config.cinetpay.baseUrl.replace(/\/$/, '');
  if (String(key).startsWith('sk_live_')) return 'https://api.cinetpay.co';
  return DEFAULT_BASE;
}

/** Sonde best-effort l'IP sortante du backend (pour message de whitelisting). */
async function probeEgressIp() {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) return (await r.json().catch(() => null))?.ip ?? null;
  } catch { /* ignore */ }
  return null;
}

/**
 * Récupère un token d'accès (avec cache) pour le pays donné.
 * @param {string} countryCode
 * @returns {Promise<{ token: string, base: string, key: string }>}
 */
async function getAccessToken(countryCode) {
  const { key, password } = credentialsFor(countryCode);
  const base = baseForKey(key);

  const cached = tokenCache.get(countryCode);
  if (cached && cached.expiresAt > Date.now()) return { token: cached.token, base, key };

  const res = await fetch(`${base}/v1/oauth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_key: key, api_password: password }),
  });
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not json */ }

  if (!res.ok) {
    const ip = await probeEgressIp();
    const lower = raw.toLowerCase();
    const ipReject = lower.includes('not_allowed') || lower.includes('whitelist') ||
      (raw.trim() === '' && [401, 403, 404].includes(res.status));
    logger.error({ status: res.status, ip, body: raw.slice(0, 300) }, 'CinetPay auth failed');
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', {
      details: {
        message: ipReject
          ? `CinetPay refuse l'IP du backend (${ip ?? 'inconnue'}). Ajoute-la à la liste blanche du compte marchand.`
          : `Échec d'authentification CinetPay (${res.status}).`,
        egressIp: ip,
      },
    });
  }

  const token = data?.access_token || data?.data?.token || data?.token;
  if (!token) throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', { details: { message: 'Token CinetPay absent.' } });
  tokenCache.set(countryCode, { token, expiresAt: Date.now() + 45 * 60 * 1000 });
  return { token, base, key };
}

/** Appel authentifié à l'API CinetPay v1. */
async function cinetpayFetch(countryCode, path, init = {}) {
  const { token, base } = await getAccessToken(countryCode);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers || {}) };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, { ...init, headers });
}

/**
 * Initialise un paiement (PayIn) et renvoie l'URL de paiement hébergée.
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @param {string} p.transactionId - `merchant_transaction_id`.
 * @param {number} p.amount
 * @param {string} p.currency
 * @param {string} p.paymentMethod - Opérateur Mobile Money (ex. `OM`, `MOMO`, `FLOOZ`…).
 * @param {string} p.notifyToken
 * @param {string} p.notifyUrl
 * @param {string} p.successUrl
 * @param {string} p.failedUrl
 * @param {string} [p.designation]
 * @param {{ email?: string, firstName?: string, lastName?: string, phone?: string }} [p.customer]
 * @returns {Promise<{ paymentUrl: string, mustBeRedirected: boolean, status?: string, raw: object }>}
 */
export async function initPayment({
  countryCode, transactionId, amount, currency, paymentMethod,
  notifyToken, notifyUrl, successUrl, failedUrl, designation, customer = {},
}) {
  const payload = {
    currency,
    payment_method: paymentMethod,
    merchant_transaction_id: transactionId,
    amount,
    lang: 'fr',
    designation: (designation || 'Dual Music - crédits').slice(0, 255),
    client_email: customer.email || '',
    client_first_name: customer.firstName || 'Dual',
    client_last_name: customer.lastName || 'Music',
    client_phone_number: customer.phone || '',
    success_url: successUrl,
    failed_url: failedUrl,
    notify_url: notifyUrl,
    notify_token: notifyToken,
    direct_pay: false,
  };

  const res = await cinetpayFetch(countryCode, '/v1/payment', { method: 'POST', body: JSON.stringify(payload) });
  const raw = await res.json().catch(() => ({}));
  const details = raw?.data || raw?.details || raw;
  if (!res.ok || !details?.payment_url) {
    logger.error({ status: res.status, details }, 'CinetPay init failed');
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', { details: { message: details?.message || 'Initialisation CinetPay échouée.' } });
  }
  return {
    paymentUrl: details.payment_url,
    mustBeRedirected: !!details.must_be_redirected,
    status: details.status,
    raw,
  };
}

/**
 * Vérifie le statut canonique d'une transaction (server-to-server). À toujours appeler
 * avant de créditer un compte (ne jamais se fier au corps du webhook seul).
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @param {string} p.transactionId - `merchant_transaction_id`.
 * @returns {Promise<{ accepted: boolean, status: string, raw: object }>}
 */
export async function checkPayment({ countryCode, transactionId }) {
  const res = await cinetpayFetch(countryCode, `/v1/payment/${encodeURIComponent(transactionId)}`, { method: 'GET' });
  const raw = await res.json().catch(() => ({}));
  const details = raw?.data || raw?.details || raw;
  const status = String(details?.status || 'UNKNOWN').toUpperCase();
  const accepted = ['ACCEPTED', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID'].includes(status);
  return { accepted, status, raw };
}

export default { initPayment, checkPayment };
