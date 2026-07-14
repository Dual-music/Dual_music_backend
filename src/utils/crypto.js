import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { config } from '../config/env.js';

/**
 * @file Cryptographic helpers for opaque tokens and OTP codes.
 *
 * Refresh tokens and OTP codes are stored **hashed** (HMAC-SHA256 keyed by
 * `TOKEN_HASH_SECRET`), never in plaintext. Comparisons use constant-time
 * equality to avoid timing side-channels.
 *
 * @module utils/crypto
 */

/**
 * Computes a keyed HMAC-SHA256 hex digest of a value (for at-rest hashing).
 * @param {string} value
 * @returns {string} 64-char hex digest.
 */
export function hmacHash(value) {
  return createHmac('sha256', config.jwt.tokenHashSecret).update(String(value)).digest('hex');
}

/**
 * Generates a cryptographically-random opaque token (URL-safe base64).
 * @param {number} [bytes=48]
 * @returns {string}
 */
export function randomToken(bytes = 48) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Generates a numeric OTP code of the configured length.
 * @param {number} [length=config.otp.length]
 * @returns {string} Zero-padded numeric string.
 */
export function generateOtp(length = config.otp.length) {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

/**
 * Constant-time comparison of two hex digests / strings of equal length.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export default { hmacHash, randomToken, generateOtp, safeEqual };
