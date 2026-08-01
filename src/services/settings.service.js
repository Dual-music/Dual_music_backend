import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file Public platform-settings reader.
 *
 * The former Supabase frontend read a handful of `platform_settings` keys
 * directly (and publicly) to drive the UI — credit conversion, pricing/referral
 * toggles, vote costs, contact/social links, push VAPID key. This service
 * exposes ONLY those non-sensitive keys through an explicit allow-list so the
 * REST backend can serve unauthenticated config reads without leaking
 * admin-only settings. Writes stay admin-gated in `admin.service.js`.
 *
 * @module services/settings.service
 */

/** Config keys safe to expose to unauthenticated clients. */
export const PUBLIC_SETTING_KEYS = Object.freeze([
  'economic_config',
  'vote_config',
  'pricing_config',
  'referral_config',
  'welcome_config',
  'push_config',
  'contact_info',
  'social_links',
  'payout_config',
  'report_config',
  'subscription_config',
  'maintenance_config',
  'payment_providers_config',
  'withdrawal_providers_config',
  // Public-facing feature toggles read by signup/validation/report UIs.
  'artist_requests_enabled',
  'manager_requests_enabled',
  // Whether managers may create duels themselves (default off: admin assigns duels).
  'manager_duel_creation',
  'live_report_config',
  'account_report_config',
]);

const PUBLIC_KEY_SET = new Set(PUBLIC_SETTING_KEYS);

/**
 * Reads a single public setting value.
 * @param {string} key
 * @returns {Promise<unknown|null>} The stored JSON value, or `null` if unset.
 * @throws {ApiError} 404 when the key is not public.
 */
export async function getPublicSetting(key) {
  if (!PUBLIC_KEY_SET.has(key)) throw ApiError.notFound('NOT_FOUND');
  const row = await db.PlatformSetting.findByPk(key, { raw: true });
  return row?.value ?? null;
}

/**
 * Reads several public settings at once (defaults to the full allow-list).
 * @param {string[]} [keys] - Subset of {@link PUBLIC_SETTING_KEYS}.
 * @returns {Promise<Record<string, unknown>>} Map of key → value (missing → null).
 */
export async function getPublicSettings(keys) {
  const requested = Array.isArray(keys) && keys.length
    ? keys.filter((k) => PUBLIC_KEY_SET.has(k))
    : PUBLIC_SETTING_KEYS;
  const rows = await db.PlatformSetting.findAll({
    where: { key: requested },
    attributes: ['key', 'value'],
    raw: true,
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const key of requested) out[key] = byKey.get(key) ?? null;
  return out;
}

/**
 * Reads the public exchange-rate table (USD pivot). Replaces the frontend's
 * former public `supabase.from('exchange_rates').select('*')`. The frontend
 * keeps a hardcoded fallback, so an empty table is acceptable.
 * @returns {Promise<Array<{ currency_code: string, name: string|null, symbol: string|null, rate_per_usd: number }>>}
 */
export async function getExchangeRates() {
  const rows = await db.ExchangeRate.findAll({
    attributes: ['currency_code', 'name', 'symbol', 'rate_per_usd', 'updated_at'],
    raw: true,
  });
  return rows.map((r) => ({ ...r, rate_per_usd: Number(r.rate_per_usd) }));
}

export default { PUBLIC_SETTING_KEYS, getPublicSetting, getPublicSettings, getExchangeRates };
