import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { config } from '../../config/env.js';
import { getS3, isStorageConfigured, publicUrlFor } from '../../config/storage.js';

/**
 * @file S3-compatible storage driver (Cloudflare R2 / AWS S3).
 *
 * Implements the storage-driver contract used by {@link module:services/upload.service}:
 * the client uploads **directly** to the object store via a presigned `PUT` URL,
 * offloading bandwidth from the API. Reads for validation/antivirus stream the
 * object back through the SDK.
 *
 * @module services/storage/s3.driver
 */

/** Reads an S3 object body stream into a Buffer. */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** @type {import('./index.js').StorageDriver} */
export const s3Driver = {
  name: 's3',

  isConfigured: () => isStorageConfigured(),

  async presignPut({ key, contentType, isPrivate }) {
    const s3 = getS3();
    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ContentType: contentType,
      ...(isPrivate ? { ACL: 'private' } : {}),
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: config.s3.presignExpires });
    return { uploadUrl, headers: { 'Content-Type': contentType } };
  },

  async presignGet(key) {
    const s3 = getS3();
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
      { expiresIn: config.s3.presignExpires },
    );
    return { url, expiresIn: config.s3.presignExpires };
  },

  async getRange(key, start, end) {
    const s3 = getS3();
    const res = await s3.send(
      new GetObjectCommand({ Bucket: config.s3.bucket, Key: key, Range: `bytes=${start}-${end}` }),
    );
    return streamToBuffer(res.Body);
  },

  async getFull(key) {
    const s3 = getS3();
    const res = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    return streamToBuffer(res.Body);
  },

  async delete(key) {
    const s3 = getS3();
    await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  },

  publicUrl: (key) => publicUrlFor(key),

  publicBaseUrl: () => config.s3.publicBaseUrl || `${config.s3.endpoint}/${config.s3.bucket}`,
};

export default s3Driver;
