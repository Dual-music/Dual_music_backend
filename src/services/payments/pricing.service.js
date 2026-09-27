import { Op } from 'sequelize';

import { db } from '../../models/index.js';

/**
 * @file Recharge pricing — faithful port of the frontend `computeCreditsForRecharge`
 * shared helper.
 *
 * Honors the admin-controlled `platform_settings.economic_config`:
 *   - `credit_value_usd`       — USD price of 1 credit (default 0.01).
 *   - `recharge.fee_pct`       — global fee % deducted before conversion.
 *   - `recharge.provider_fees` — per-provider fee overrides.
 * Conversion: the paid amount is discounted by the fee, converted to USD via
 * `exchange_rates(currency_code, rate_per_usd)`, then floored to whole credits.
 *
 * @module services/payments/pricing.service
 */

/**
 * @typedef {'cinetpay'|'moneroo'|'stripe'} ProviderKey
 * @typedef {object} RechargeQuote
 * @property {number} credits
 * @property {number} feePct
 * @property {number} netAmount
 * @property {number} netUsd
 * @property {number} creditValueUsd
 */

/**
 * Computes how many credits `amount` in `currency` buys via `provider`.
 * @param {number} amount - Gross amount paid, in `currency` units.
 * @param {string} currency - ISO currency code (e.g. 'XOF', 'USD', 'EUR').
 * @param {ProviderKey} provider
 * @returns {Promise<RechargeQuote>}
 */
export async function computeCreditsForRecharge(amount, currency, provider) {
  const cfgRow = await db.PlatformSetting.findByPk('economic_config');
  const v = cfgRow?.value ?? {};

  const creditValueUsd = Number(v.credit_value_usd) || 0.01;
  const baseFee = Number(v?.recharge?.fee_pct) || 0;
  const perProvider = v?.recharge?.provider_fees ?? {};
  const feePct = Number(perProvider[provider] ?? baseFee) || 0;

  const rates = await db.ExchangeRate.findAll({
    where: { currency_code: { [Op.in]: [currency, 'USD'] } },
    attributes: ['currency_code', 'rate_per_usd'],
    raw: true,
  });
  const rate = Number(rates.find((r) => r.currency_code === currency)?.rate_per_usd) || 1;

  const netAmount = amount * (1 - feePct / 100);
  const netUsd = netAmount / rate;
  const credits = Math.max(0, Math.floor(netUsd / creditValueUsd));

  return { credits, feePct, netAmount, netUsd, creditValueUsd };
}

/**
 * Convertit un montant de crédits en **devise locale**, pour un versement
 * (transfert Mobile Money). C'est l'inverse exact de {@link computeCreditsForRecharge} :
 * crédits → USD via `credit_value_usd`, puis USD → devise via `rate_per_usd`.
 *
 * Aucun frais n'est appliqué ici : la commission de retrait est déduite en amont
 * (`withdrawal.service.calculateNet`), le portefeuille ayant été débité du brut.
 *
 * Le résultat est **tronqué à l'entier** : les opérateurs Mobile Money n'acceptent
 * pas de décimales sur XOF/XAF, et arrondir au supérieur ferait verser plus que
 * ce qui a été réservé.
 *
 * @param {number} credits - Crédits nets à verser.
 * @param {string} currency - Devise locale cible (ex. 'XOF').
 * @returns {Promise<{ amount: number, usd: number, rate: number, creditValueUsd: number }>}
 */
export async function computePayoutAmount(credits, currency) {
  const cfgRow = await db.PlatformSetting.findByPk('economic_config');
  const creditValueUsd = Number(cfgRow?.value?.credit_value_usd) || 0.01;

  const row = await db.ExchangeRate.findOne({
    where: { currency_code: currency },
    attributes: ['rate_per_usd'],
    raw: true,
  });
  const rate = Number(row?.rate_per_usd) || 0;

  const usd = credits * creditValueUsd;
  const amount = rate > 0 ? Math.floor(usd * rate) : 0;
  return { amount, usd, rate, creditValueUsd };
}

export default { computeCreditsForRecharge, computePayoutAmount };
