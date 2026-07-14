/**
 * @file Money & credit helpers.
 *
 * Business invariant: **1 credit = 0.50 EUR** (configurable via `CREDIT_EUR_VALUE`).
 * All monetary values are handled as `DECIMAL(18,2)` in the database; helpers here
 * round consistently to 2 decimals to avoid floating-point drift in ledgers.
 *
 * @module utils/money
 */

import { config } from '../config/env.js';

/**
 * Rounds a number to 2 decimal places (half-up), returning a Number.
 * @param {number} value
 * @returns {number}
 */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Converts a credit amount to its EUR value.
 * @param {number} credits
 * @returns {number} EUR amount.
 */
export function creditsToEur(credits) {
  return round2(Number(credits) * config.economy.creditEurValue);
}

/**
 * Converts a EUR amount to credits.
 * @param {number} eur
 * @returns {number} Credit amount.
 */
export function eurToCredits(eur) {
  return round2(Number(eur) / config.economy.creditEurValue);
}

/**
 * Validates that an amount is a strictly positive, finite number.
 * @param {unknown} amount
 * @returns {boolean}
 */
export function isPositiveAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0;
}

export default { round2, creditsToEur, eurToCredits, isPositiveAmount };
