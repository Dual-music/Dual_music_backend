import { config } from '../../config/env.js';

import { localDriver } from './local.driver.js';
import { s3Driver } from './s3.driver.js';

/**
 * @file Storage driver selector.
 *
 * Exposes a single active storage driver chosen at boot from `STORAGE_DRIVER`
 * (`s3` = Cloudflare R2 / AWS S3, `local` = backend disk). The upload service
 * talks only to this abstraction, so switching backends is a deployment concern
 * (an env var), never a runtime toggle — swapping at runtime would orphan the
 * public URLs already persisted on existing resources. See docs/STORAGE.md.
 *
 * @module services/storage
 */

/**
 * @typedef {object} StorageDriver
 * @property {string} name                       Driver id (`s3` | `local`).
 * @property {() => boolean} isConfigured        Whether the driver can serve requests.
 * @property {(o: { key: string, contentType: string, isPrivate?: boolean }) => Promise<{ uploadUrl: string, headers: Record<string,string> }>} presignPut
 * @property {(key: string) => Promise<{ url: string, expiresIn: number }>} presignGet
 * @property {(key: string, start: number, end: number) => Promise<Buffer>} getRange
 * @property {(key: string) => Promise<Buffer>} getFull
 * @property {(key: string) => Promise<void>} delete
 * @property {(key: string) => string} publicUrl
 * @property {() => string} publicBaseUrl
 */

/**
 * Returns the active storage driver for the current configuration.
 * @returns {StorageDriver}
 */
export function getStorageDriver() {
  return config.storage.driver === 'local' ? localDriver : s3Driver;
}

/**
 * Read-only storage status for the admin console (no secrets exposed).
 * @returns {{ driver: string, configured: boolean, publicBaseUrl: string }}
 */
export function storageInfo() {
  const driver = getStorageDriver();
  return {
    driver: driver.name,
    configured: driver.isConfigured(),
    publicBaseUrl: driver.publicBaseUrl(),
  };
}

export default getStorageDriver;
