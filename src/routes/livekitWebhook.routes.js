import express, { Router } from 'express';
import { WebhookReceiver, EgressStatus } from 'livekit-server-sdk';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
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
      // Un enregistrement peut être fait de PLUSIEURS segments (pause/reprise — l'egress
      // LiveKit n'a pas de vraie pause) : COMPLETE/FAILED/ABORTED referme le SEGMENT concerné,
      // pas forcément toute la session — `finalizeFromEgress` sait faire la distinction et ne
      // déclenche le recollage final que si tous les segments sont clos. On ignore les autres
      // statuts (mises à jour intermédiaires pendant un enregistrement encore en cours).
      if (status === EgressStatus.EGRESS_COMPLETE || status === EgressStatus.EGRESS_FAILED || status === EgressStatus.EGRESS_ABORTED) {
        await finalizeFromEgress(event.egressInfo);
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
