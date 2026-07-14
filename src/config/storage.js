import { S3Client } from '@aws-sdk/client-s3';

import { config } from './env.js';
import { logger } from './logger.js';

/**
 * @file S3-compatible storage client factory (AWS S3 / Cloudflare R2).
 *
 * Lazily builds a single shared `S3Client` from `config.s3`. `forcePathStyle`
 * is enabled so non-AWS S3-compatible endpoints (R2, MinIO) address buckets as
 * `endpoint/bucket/key`. When credentials/endpoint are not configured,
 * `getS3()` returns `null` and the upload feature reports itself disabled
 * rather than crashing the process.
 *
 * @module config/storage
 */

/** @type {import('@aws-sdk/client-s3').S3Client | null} */
let client = null;
let attempted = false;

/**
 * Whether storage is configured (endpoint + credentials present).
 * @returns {boolean}
 */
export function isStorageConfigured() {
  const s = config.s3;
  return Boolean(s.endpoint && s.accessKeyId && s.secretAccessKey && s.bucket);
}

/**
 * Lazily creates (once) and returns the shared S3 client.
 * @returns {import('@aws-sdk/client-s3').S3Client | null} Client, or `null` when disabled.
 */
export function getS3() {
  if (attempted) return client;
  attempted = true;
  if (!isStorageConfigured()) {
    logger.warn('S3 storage not configured — upload endpoints will return 503');
    return null;
  }
  client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
  });
  logger.info('S3 storage client initialized');
  return client;
}

/**
 * Builds the public URL for a stored object key.
 * @param {string} key
 * @returns {string}
 */
export function publicUrlFor(key) {
  const base = config.s3.publicBaseUrl || `${config.s3.endpoint}/${config.s3.bucket}`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

export default getS3;
