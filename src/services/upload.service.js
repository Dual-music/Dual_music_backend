import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getS3, publicUrlFor } from '../config/storage.js';
import { scanBuffer } from '../services/clamav.service.js';
import { ApiError } from '../utils/ApiError.js';
import { detectFileType } from '../utils/fileType.js';

/**
 * @file Uploads domain service — server-side presigned URLs for S3-compatible
 * storage. The client requests a presigned `PUT` for a given category, uploads
 * the file directly to S3 (offloading bandwidth from the API), then persists
 * the returned public URL on the owning resource (avatar, replay, sponsor…).
 *
 * Security: the caller-declared `contentType` is validated against a per-
 * category allowlist and pinned into the signature, so the object can only be
 * stored with an approved MIME type; object keys are server-generated
 * (nanoid + sanitized extension) to prevent path traversal / overwrite.
 * Byte-level magic-number validation would require proxying the bytes through
 * the API and is documented as a follow-up (see docs/DECISIONS.md).
 *
 * @module services/upload.service
 */

const MB = 1024 * 1024;

/**
 * Upload categories → storage prefix, allowed MIME groups, and size cap.
 * @type {Record<string, { prefix: string, kinds: string[], maxBytes: number, private?: boolean }>}
 */
const CATEGORIES = {
  avatar: { prefix: 'uploads/avatars', kinds: ['image'], maxBytes: 5 * MB },
  image: { prefix: 'uploads/images', kinds: ['image'], maxBytes: 5 * MB },
  video: { prefix: 'uploads/videos', kinds: ['video'], maxBytes: 500 * MB },
  lifestyle: { prefix: 'uploads/lifestyle', kinds: ['video'], maxBytes: 500 * MB },
  replay: { prefix: 'uploads/replays', kinds: ['video'], maxBytes: 2048 * MB, private: true },
  sponsor: { prefix: 'sponsor-media', kinds: ['image', 'video'], maxBytes: 500 * MB },
  attachment: { prefix: 'uploads/attachments', kinds: ['image', 'pdf'], maxBytes: 10 * MB },
};

/** MIME group detector. @param {string} contentType @returns {string|null} */
function mimeKind(contentType) {
  if (/^image\//.test(contentType)) return 'image';
  if (/^video\//.test(contentType)) return 'video';
  if (contentType === 'application/pdf') return 'pdf';
  return null;
}

/** Safe file extension from a filename (letters/digits only, ≤5 chars). */
function safeExt(filename) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename || '');
  return m ? `.${m[1].toLowerCase()}` : '';
}

/**
 * Issues a presigned upload (`PUT`) URL for a category.
 *
 * @param {object} params
 * @param {string} params.userId       - Owner (namespaces the key).
 * @param {string} params.category     - One of {@link CATEGORIES}.
 * @param {string} params.filename     - Original filename (for extension only).
 * @param {string} params.contentType  - Declared MIME type (pinned into the signature).
 * @param {number} [params.size]       - Byte size, validated against the cap.
 * @returns {Promise<{ key: string, uploadUrl: string, publicUrl: string, expiresIn: number, headers: Record<string,string> }>}
 * @throws {ApiError} 503 storage disabled · 400 invalid category/type · 413 too large.
 */
export async function presignUpload({ userId, category, filename, contentType, size }) {
  const s3 = getS3();
  if (!s3) throw new ApiError(503, 'STORAGE_UNAVAILABLE', { message: 'Storage is not configured' });

  const cat = CATEGORIES[category];
  if (!cat) throw ApiError.badRequest('VALIDATION_ERROR', { details: { category } });

  const kind = mimeKind(contentType);
  if (!kind || !cat.kinds.includes(kind)) {
    throw ApiError.badRequest('UNSUPPORTED_MEDIA_TYPE', { details: { contentType, allowed: cat.kinds } });
  }
  if (size != null && Number(size) > cat.maxBytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', { details: { maxBytes: cat.maxBytes } });
  }

  const key = `${cat.prefix}/${userId}/${nanoid(21)}${safeExt(filename)}`;
  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType,
    ...(cat.private ? { ACL: 'private' } : {}),
  });
  const expiresIn = config.s3.presignExpires;
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn });

  return {
    key,
    uploadUrl,
    publicUrl: publicUrlFor(key),
    expiresIn,
    headers: { 'Content-Type': contentType },
  };
}

/**
 * Issues a short-lived presigned download (`GET`) URL for a private object
 * (e.g. premium replays). The caller-provided key must belong to a known
 * private prefix.
 *
 * @param {string} key - Object key returned by a prior presigned upload.
 * @returns {Promise<{ url: string, expiresIn: number }>}
 * @throws {ApiError} 503 storage disabled · 400 key outside a private prefix.
 */
export async function presignDownload(key) {
  const s3 = getS3();
  if (!s3) throw new ApiError(503, 'STORAGE_UNAVAILABLE', { message: 'Storage is not configured' });

  const privatePrefixes = Object.values(CATEGORIES).filter((c) => c.private).map((c) => c.prefix);
  if (!privatePrefixes.some((p) => key.startsWith(`${p}/`))) {
    throw ApiError.badRequest('VALIDATION_ERROR', { details: { key } });
  }
  const expiresIn = config.s3.presignExpires;
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), { expiresIn });
  return { url, expiresIn };
}

/** Reads an S3 object body stream into a Buffer. */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Finds the upload category whose prefix owns a key. */
function categoryForKey(key) {
  for (const [name, cat] of Object.entries(CATEGORIES)) {
    if (key.startsWith(`${cat.prefix}/`)) return { name, ...cat };
  }
  return null;
}

/**
 * Confirms a completed upload: validates the object's **real** type by its magic
 * bytes (independent of the declared Content-Type), optionally runs an antivirus
 * scan, and **deletes** the object if it fails either check.
 *
 * Ownership is enforced by the key layout (`<prefix>/<userId>/<id>`). Antivirus
 * is skipped for large video categories (bounded-size media only) and only runs
 * when `CLAMAV_ENABLED=true`.
 *
 * @param {string} userId
 * @param {string} key - The object key returned by {@link presignUpload}.
 * @returns {Promise<{ valid: boolean, key: string, publicUrl: string, contentType: string }>}
 * @throws {ApiError} 503 storage · 400 bad key · 403 not owner · 415 content mismatch · 422 infected.
 */
export async function confirmUpload(userId, key) {
  const s3 = getS3();
  if (!s3) throw new ApiError(503, 'STORAGE_UNAVAILABLE', { message: 'Storage is not configured' });

  const cat = categoryForKey(key);
  if (!cat) throw ApiError.badRequest('VALIDATION_ERROR', { details: { key } });
  if (!key.startsWith(`${cat.prefix}/${userId}/`)) throw ApiError.forbidden('FORBIDDEN');

  const deleteObject = () =>
    s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key })).catch((err) =>
      logger.warn({ err: err?.message, key }, 'failed to delete rejected upload'),
    );

  // 1) Magic-byte validation on the leading bytes.
  const head = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key, Range: 'bytes=0-1023' }));
  const headBuf = await streamToBuffer(head.Body);
  const detected = detectFileType(headBuf);
  if (!detected || !cat.kinds.includes(detected.group)) {
    await deleteObject();
    throw ApiError.badRequest('UNSUPPORTED_MEDIA_TYPE', { details: { detected: detected?.type ?? 'unknown', allowed: cat.kinds } });
  }

  // 2) Optional antivirus scan (bounded-size categories only).
  if (config.clamav.enabled && detected.group !== 'video') {
    const full = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    const buf = await streamToBuffer(full.Body);
    const scan = await scanBuffer(buf);
    if (!scan.clean) {
      await deleteObject();
      throw new ApiError(422, 'FILE_INFECTED', { details: { signature: scan.signature } });
    }
  }

  return { valid: true, key, publicUrl: publicUrlFor(key), contentType: detected.type };
}

export default { presignUpload, presignDownload, confirmUpload };
