import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';

/**
 * @file JWT signing/verification utilities.
 *
 * Prefers **RS256** (asymmetric) when a key pair is configured — the production
 * default mandated by the security spec. Falls back to **HS256** using
 * `TOKEN_HASH_SECRET` when no RSA keys are present, so local development boots
 * with zero setup. The algorithm is derived solely from configuration, never
 * from the token header, preventing algorithm-confusion attacks.
 *
 * @module utils/jwt
 */

const useRs256 = Boolean(config.jwt.privateKey && config.jwt.publicKey);
const algorithm = useRs256 ? 'RS256' : 'HS256';
const signingKey = useRs256 ? config.jwt.privateKey : config.jwt.tokenHashSecret;
const verifyKey = useRs256 ? config.jwt.publicKey : config.jwt.tokenHashSecret;

/**
 * Signs an access token.
 * @param {object} payload - Claims (must include `sub` = user id).
 * @param {string|number} [expiresIn] - Overrides the default access TTL.
 * @returns {string} Signed JWT.
 */
export function signAccessToken(payload, expiresIn = config.jwt.accessTtl) {
  return jwt.sign(payload, signingKey, { algorithm, expiresIn, issuer: 'dual-music' });
}

/**
 * Verifies and decodes a token.
 * @param {string} token
 * @returns {import('jsonwebtoken').JwtPayload & { sub: string }}
 * @throws {jwt.JsonWebTokenError} When the token is invalid or expired.
 */
export function verifyToken(token) {
  return /** @type {any} */ (jwt.verify(token, verifyKey, { algorithms: [algorithm], issuer: 'dual-music' }));
}

/**
 * Indicates which algorithm the runtime is configured to use (for diagnostics).
 * @returns {'RS256'|'HS256'}
 */
export function activeAlgorithm() {
  return algorithm;
}

export default { signAccessToken, verifyToken, activeAlgorithm };
