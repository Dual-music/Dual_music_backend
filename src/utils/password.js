import bcrypt from 'bcryptjs';

import { config } from '../config/env.js';

/**
 * @file Password hashing utilities (bcrypt, cost 12 by default).
 * @module utils/password
 */

/**
 * Hashes a plaintext password.
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash.
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, config.jwt.bcryptCost);
}

/**
 * Verifies a plaintext password against a hash. Returns false when no hash
 * exists (e.g. OAuth-only accounts) instead of throwing.
 * @param {string} plain
 * @param {string|null|undefined} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export default { hashPassword, verifyPassword };
