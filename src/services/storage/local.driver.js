import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * @file Local-disk storage driver (backend filesystem).
 *
 * Implements the same driver contract as the S3 driver, but stores objects on
 * the backend's local disk instead of an object store. Since there is no cloud
 * endpoint to sign, "presigned" URLs point back to **our own** token-authorized
 * routes:
 *   - upload  → `PUT  {API_BASE_URL}/api/v1/uploads/local/<token>`  (op=put)
 *   - private → `GET  {API_BASE_URL}/api/v1/uploads/local/<token>`  (op=get)
 *   - public  → `GET  {PUBLIC_BASE}/media/<key>`                    (static serve)
 *
 * Tokens are short-lived HMAC-signed payloads ({ key, op, exp }), so an upload
 * URL cannot be replayed or repointed to another key. Keys are server-generated
 * (nanoid), and every path is re-resolved under the storage root to prevent
 * traversal.
 *
 * ⚠️ Local disk is **ephemeral** on most PaaS hosts (files vanish on redeploy)
 * and does not scale horizontally — use the `s3` driver in production. See
 * docs/STORAGE.md.
 *
 * @module services/storage/local.driver
 */

/** Absolute storage root (resolved once). */
const ROOT = resolve(config.storage.local.dir);
/** HMAC secret for signed upload/download tokens (reuses the app token secret). */
const SECRET = config.jwt.tokenHashSecret;

/**
 * Resolves an object key to an absolute path **inside** the storage root,
 * rejecting any path that would escape it (traversal guard).
 * @param {string} key
 * @returns {string} absolute path
 * @throws {ApiError} 400 when the key escapes the storage root.
 */
export function pathFor(key) {
  const abs = resolve(ROOT, key);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) {
    throw ApiError.badRequest('VALIDATION_ERROR', { details: { key } });
  }
  return abs;
}

/** Current unix time in seconds. */
function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Signs a token payload as `base64url(json).base64url(hmac)`.
 * @param {{ key: string, op: 'put'|'get', ct?: string, exp: number }} payload
 * @returns {string}
 */
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verifies a signed token and returns its payload, or `null` when the signature
 * is invalid or the token has expired.
 * @param {string} token
 * @returns {{ key: string, op: string, ct?: string, exp: number } | null}
 */
export function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data?.exp || data.exp < nowSeconds()) return null;
  return data;
}

/** Reads a readable stream into a Buffer. */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Streams an incoming request body to disk under the given key (used by the
 * token-authorized `PUT` route).
 * @param {string} key
 * @param {import('node:stream').Readable} readable
 * @returns {Promise<void>}
 */
export async function saveStream(key, readable) {
  const dest = pathFor(key);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(readable, createWriteStream(dest));
}

/** @type {import('./index.js').StorageDriver} */
export const localDriver = {
  name: 'local',

  // Local disk only needs a writable directory — always considered configured.
  isConfigured: () => true,

  async presignPut({ key, contentType }) {
    const token = sign({ key, op: 'put', ct: contentType, exp: nowSeconds() + config.s3.presignExpires });
    return {
      uploadUrl: `${config.apiBaseUrl}/api/v1/uploads/local/${token}`,
      headers: { 'Content-Type': contentType },
    };
  },

  async presignGet(key) {
    const token = sign({ key, op: 'get', exp: nowSeconds() + config.s3.presignExpires });
    return {
      url: `${config.apiBaseUrl}/api/v1/uploads/local/${token}`,
      expiresIn: config.s3.presignExpires,
    };
  },

  async getRange(key, start, end) {
    // `end` is inclusive for fs read streams — matches the S3 Range semantics.
    return streamToBuffer(createReadStream(pathFor(key), { start, end }));
  },

  async getFull(key) {
    return readFile(pathFor(key));
  },

  async delete(key) {
    await rm(pathFor(key), { force: true });
  },

  publicUrl(key) {
    const base = (config.storage.local.publicBaseUrl || config.apiBaseUrl).replace(/\/$/, '');
    return `${base}/media/${key}`;
  },

  publicBaseUrl: () =>
    `${(config.storage.local.publicBaseUrl || config.apiBaseUrl).replace(/\/$/, '')}/media`,
};

export default localDriver;
