import express, { Router } from 'express';
import { WebhookReceiver, EgressStatus } from 'livekit-server-sdk';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { finalizeFromEgress } from '../services/recording.service.js';

/**
 * @file LiveKit webhook endpoint (`POST /webhooks/livekit`).
 *
 * Verifies the signed webhook (HMAC via {@link WebhookReceiver}) and reacts to
 * egress lifecycle events: on a COMPLETE egress we create the replay; on a
 * FAILED/ABORTED one we mark the recording failed. Mounted BEFORE `express.json`
 * so the raw body is available for signature verification.
 *
 * @module routes/livekitWebhook
 */
export const livekitWebhookRouter = Router();

const receiver =
  config.livekit.apiKey && config.livekit.apiSecret
    ? new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret)
    : null;

livekitWebhookRouter.post('/', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  if (!receiver) return res.status(200).end();
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const event = await receiver.receive(body, req.get('Authorization'));

    if (event.egressInfo && (event.event === 'egress_ended' || event.event === 'egress_updated')) {
      const status = event.egressInfo.status;
      if (status === EgressStatus.EGRESS_COMPLETE) {
        await finalizeFromEgress(event.egressInfo);
      } else if (status === EgressStatus.EGRESS_FAILED || status === EgressStatus.EGRESS_ABORTED) {
        await db.StreamRecording.update(
          { status: 'failed', ended_at: new Date(), error: event.egressInfo.error || 'egress failed' },
          { where: { egress_id: event.egressInfo.egressId } },
        ).catch(() => {});
      }
    }
    res.status(200).end();
  } catch (err) {
    // 200 volontaire : une erreur non critique ne doit pas déclencher de retries agressifs.
    logger.warn({ err: err?.message }, 'livekit webhook error');
    res.status(200).end();
  }
});

export default livekitWebhookRouter;
