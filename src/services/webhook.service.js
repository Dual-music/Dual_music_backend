import { db } from '../models/index.js';

/**
 * @file Webhook processed-once ledger (`webhook_events`).
 *
 * Gives payment webhooks replay protection independent of the settlement
 * procedures: a `(provider, external_id)` pair is claimed on first receipt and
 * marked `processed` only after a successful settlement. A duplicate delivery of
 * an already-`processed` event is short-circuited; a delivery for an event still
 * `processing` (e.g. an earlier "pending" callback) is allowed to proceed so a
 * later "accepted" callback can settle it.
 *
 * @module services/webhook.service
 */

/**
 * Claims a webhook event for processing.
 * @param {'cinetpay'|'moneroo'|'stripe'} provider
 * @param {string|undefined|null} externalId - Provider-unique id (event/tx id).
 * @param {string|null} [payloadHash]
 * @returns {Promise<{ fresh: boolean, record: object|null }>} `fresh=false` → already processed / duplicate.
 */
export async function claimWebhookEvent(provider, externalId, payloadHash = null) {
  if (!externalId) return { fresh: true, record: null }; // cannot dedupe without an id
  try {
    const [row, created] = await db.WebhookEvent.findOrCreate({
      where: { provider, external_id: String(externalId) },
      defaults: { provider, external_id: String(externalId), status: 'processing', payload_hash: payloadHash },
    });
    if (!created && row.status === 'processed') return { fresh: false, record: row };
    return { fresh: true, record: row };
  } catch {
    // Unique-constraint race → another delivery is handling it.
    return { fresh: false, record: null };
  }
}

/**
 * Marks a claimed webhook event as processed.
 * @param {object|null} record
 * @returns {Promise<void>}
 */
export async function markWebhookProcessed(record) {
  if (!record) return;
  record.status = 'processed';
  record.processed_at = new Date();
  await record.save();
}

export default { claimWebhookEvent, markWebhookProcessed };
