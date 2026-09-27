import { config } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * @file Client CinetPay — **nouvelle API v1** (Mobile Money, Afrique de l'Ouest/Centrale).
 *
 * Portage fidèle de l'intégration Supabase éprouvée (`_shared/cinetpay.ts`) :
 *   - Auth     : `POST {base}/v1/oauth/login { api_key, api_password }` → `{ access_token }`
 *   - PayIn    : `POST {base}/v1/payment` (Bearer) → `{ data: { payment_url, ... } }`
 *   - Statut   : `GET  {base}/v1/payment/{merchant_transaction_id}` (Bearer)
 *   - Transfert: `POST {base}/v1/transfer` (Bearer) → ordre de virement Mobile Money
 *   - Statut   : `GET  {base}/v1/transfer/{merchant_transaction_id}` (Bearer)
 *   - Soldes   : `GET  {base}/v1/balances` (Bearer)
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

/** Délai maximal d'un appel provider (ms) — évite de bloquer un worker sur un pendu. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Cache mémoire des tokens d'accès (par pays), ~45 min. */
const tokenCache = new Map();

/**
 * Statuts PayIn considérés comme un paiement encaissé.
 * @type {ReadonlySet<string>}
 */
const PAYIN_ACCEPTED = new Set(['ACCEPTED', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID']);

/**
 * Codes retour PayIn signalant un solde insuffisant côté payeur. Distincts d'un
 * échec définitif : l'utilisateur peut recharger son Mobile Money et réessayer.
 * @type {ReadonlySet<string>}
 */
const PAYIN_INSUFFICIENT_CODES = new Set(['627', '2005']);

/**
 * Statuts de transfert valant **versement effectué**. `VAL` (validé) est
 * spécifique à l'API transfert.
 * @type {ReadonlySet<string>}
 */
const TRANSFER_ACCEPTED = new Set(['VAL', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED']);

/**
 * Statuts de transfert valant **échec définitif** — seuls ceux-ci autorisent le
 * remboursement du portefeuille. Tout autre statut (`NEW`, `PENDING`, `TRANSFER`…)
 * signifie « en cours » et ne doit déclencher aucune écriture comptable.
 * @type {ReadonlySet<string>}
 */
const TRANSFER_REJECTED = new Set(['REJET', 'REJECT', 'REJECTED', 'FAILED', 'CANCELED', 'CANCELLED', 'ERROR']);

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

/** `fetch` avec délai maximal, pour ne jamais bloquer indéfiniment sur le provider. */
async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Sonde best-effort l'IP sortante du backend (pour message de whitelisting). */
async function probeEgressIp() {
  try {
    const r = await fetchWithTimeout('https://api.ipify.org?format=json');
    if (r.ok) return (await r.json().catch(() => null))?.ip ?? null;
  } catch { /* ignore */ }
  return null;
}

/**
 * Récupère un token d'accès (avec cache) pour le pays donné.
 * @param {string} countryCode
 * @returns {Promise<{ token: string, base: string, key: string }>}
 * @throws {ApiError} 400 `PAYMENT_PROVIDER_ERROR` — identifiants manquants, IP rejetée
 *   (l'IP sortante détectée est jointe dans `details.egressIp`) ou échec d'auth.
 */
async function getAccessToken(countryCode) {
  const { key, password } = credentialsFor(countryCode);
  const base = baseForKey(key);

  const cached = tokenCache.get(countryCode);
  if (cached && cached.expiresAt > Date.now()) return { token: cached.token, base, key };

  const res = await fetchWithTimeout(`${base}/v1/oauth/login`, {
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
    // CinetPay renvoie parfois un 404/401 au corps vide à une IP non autorisée :
    // on classe ce cas en rejet d'IP probable, sinon le diagnostic est impossible.
    const ipReject = lower.includes('not_allowed') || lower.includes('whitelist') ||
      (raw.trim() === '' && [401, 403, 404].includes(res.status));
    logger.error({ status: res.status, ip, body: raw.slice(0, 300) }, 'CinetPay auth failed');
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', {
      details: {
        message: ipReject
          ? `CinetPay refuse l'IP du backend (${ip ?? 'inconnue'}). Ajoute-la à la liste blanche du compte marchand.`
          : `Échec d'authentification CinetPay (${res.status}).`,
        egressIp: ip,
        ipRejected: ipReject,
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
  return fetchWithTimeout(`${base}${path}`, { ...init, headers });
}

/** Extrait la charge utile métier, quelle que soit l'enveloppe renvoyée. */
function unwrap(raw) {
  return raw?.data || raw?.details || raw || {};
}

/* -------------------------------------------------------------------------- */
/* PayIn                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Initialise un paiement (PayIn) et renvoie l'URL de paiement hébergée.
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @param {string} p.transactionId - `merchant_transaction_id`.
 * @param {number} p.amount
 * @param {string} p.currency
 * @param {string} p.paymentMethod - Opérateur Mobile Money (ex. `OM_CI`, `MTN_CI`…).
 * @param {string} p.notifyToken
 * @param {string} p.notifyUrl
 * @param {string} p.successUrl
 * @param {string} p.failedUrl
 * @param {string} [p.designation]
 * @param {{ email?: string, firstName?: string, lastName?: string, phone?: string }} [p.customer]
 * @returns {Promise<{ paymentUrl: string, mustBeRedirected: boolean, status?: string, raw: object }>}
 * @throws {ApiError} 400 `PAYMENT_PROVIDER_ERROR` si l'initialisation échoue.
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
  const details = unwrap(raw);
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
 * Vérifie le statut canonique d'un PayIn (server-to-server). À toujours appeler
 * avant de créditer un compte (ne jamais se fier au corps du webhook seul).
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @param {string} p.transactionId - `merchant_transaction_id`.
 * @returns {Promise<{ accepted: boolean, insufficient: boolean, status: string, code: string, raw: object }>}
 *   `accepted` → encaissé ; `insufficient` → solde payeur insuffisant (retentable) ;
 *   ni l'un ni l'autre → en cours ou échoué (voir `status`).
 */
export async function checkPayment({ countryCode, transactionId }) {
  const res = await cinetpayFetch(countryCode, `/v1/payment/${encodeURIComponent(transactionId)}`, { method: 'GET' });
  const raw = await res.json().catch(() => ({}));
  const details = unwrap(raw);
  const status = String(details?.status || 'UNKNOWN').toUpperCase();
  const code = String(raw?.code ?? details?.code ?? '');
  return {
    accepted: PAYIN_ACCEPTED.has(status) || code === '00' || code === '100',
    insufficient: PAYIN_INSUFFICIENT_CODES.has(code),
    status,
    code,
    raw,
  };
}

/* -------------------------------------------------------------------------- */
/* Transfert (PayOut)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Émet un ordre de transfert Mobile Money (PayOut) vers un bénéficiaire.
 *
 * ⚠️ Une réponse `2xx` signifie « ordre accepté par CinetPay », **pas** « argent
 * versé ». Le versement n'est acquis qu'après un statut `VAL` renvoyé par
 * {@link checkTransfer} (via webhook ou réconciliation).
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @param {string} p.transactionId - `merchant_transaction_id` (préfixe `po_`).
 * @param {number} p.amount - Montant **en devise locale**, entier.
 * @param {string} p.currency
 * @param {string} p.paymentMethod - Opérateur destinataire (ex. `OM_CI`).
 * @param {string} p.phone - Numéro du bénéficiaire (préfixe pays inclus).
 * @param {string} p.notifyToken
 * @param {string} p.notifyUrl
 * @param {string} [p.reason]
 * @returns {Promise<{ accepted: boolean, providerTxId: string|null, status?: string, message?: string, raw: object }>}
 */
export async function initTransfer({
  countryCode, transactionId, amount, currency, paymentMethod,
  phone, notifyToken, notifyUrl, reason,
}) {
  const payload = {
    currency,
    merchant_transaction_id: transactionId,
    phone_number: phone,
    amount,
    payment_method: paymentMethod,
    reason: (reason || 'Retrait de fonds').slice(0, 100),
    notify_url: notifyUrl,
    notify_token: notifyToken,
  };

  const res = await cinetpayFetch(countryCode, '/v1/transfer', { method: 'POST', body: JSON.stringify(payload) });
  const raw = await res.json().catch(() => ({}));
  const details = unwrap(raw);
  if (!res.ok) {
    logger.error({ status: res.status, details }, 'CinetPay transfer init failed');
    return { accepted: false, providerTxId: null, status: details?.status, message: details?.message, raw };
  }
  return {
    accepted: true,
    providerTxId: details?.transaction_id ?? details?.treatment_id ?? null,
    status: details?.status,
    message: details?.message,
    raw,
  };
}

/**
 * Vérifie le statut canonique d'un transfert (server-to-server).
 *
 * Retour **tri-état** volontaire : `accepted` / `rejected` / ni l'un ni l'autre
 * (= toujours en cours). Confondre « pas encore validé » et « échoué » rembourse
 * un retrait qui peut encore aboutir — et paie donc potentiellement deux fois.
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @param {string} p.transactionId - `merchant_transaction_id`.
 * @returns {Promise<{ accepted: boolean, rejected: boolean, status: string, code: string, raw: object }>}
 */
export async function checkTransfer({ countryCode, transactionId }) {
  const res = await cinetpayFetch(countryCode, `/v1/transfer/${encodeURIComponent(transactionId)}`, { method: 'GET' });
  const raw = await res.json().catch(() => ({}));
  const details = unwrap(raw);
  const status = String(details?.status || 'UNKNOWN').toUpperCase();
  const code = String(raw?.code ?? details?.code ?? '');
  const accepted = TRANSFER_ACCEPTED.has(status) || code === '00' || code === '100';
  return {
    accepted,
    rejected: !accepted && TRANSFER_REJECTED.has(status),
    status,
    code,
    raw,
  };
}

/* -------------------------------------------------------------------------- */
/* Soldes marchands                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Lit les soldes du compte marchand d'un pays. Un transfert échoue si le compte
 * est à sec : cette lecture alimente la supervision et l'alerte de seuil bas.
 *
 * @param {object} p
 * @param {string} p.countryCode
 * @returns {Promise<{ ok: boolean, available: number|null, currency: string|null, raw: object }>}
 */
export async function getBalances({ countryCode }) {
  const res = await cinetpayFetch(countryCode, '/v1/balances', { method: 'GET' });
  const raw = await res.json().catch(() => ({}));
  const details = unwrap(raw);
  // L'enveloppe varie (objet unique ou tableau de comptes) : on retient le premier
  // solde exploitable sans présumer d'une forme précise.
  const first = Array.isArray(details) ? details[0] : details;
  const available = Number(first?.available ?? first?.balance ?? first?.amount);
  return {
    ok: res.ok,
    available: Number.isFinite(available) ? available : null,
    currency: first?.currency ?? null,
    raw,
  };
}

export default { initPayment, checkPayment, initTransfer, checkTransfer, getBalances };
