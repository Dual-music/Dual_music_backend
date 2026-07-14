import { AccessToken } from 'livekit-server-sdk';

import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file LiveKit access-token service.
 *
 * Issues short-lived LiveKit JWTs for a room (duel / live / concert /
 * competition). The caller's user id is the participant `identity`. Grants are
 * derived from the requested role: **hosts/publishers** may publish audio/video;
 * **viewers** may only subscribe. Everyone may publish data messages (used for
 * lightweight in-room signalling). Mirrors the frontend `livekit-token` edge
 * function contract: `{ roomName, isHost, participantName, canPublish } →
 * { token, url, identity }`.
 *
 * @module services/livekit.service
 */

/**
 * Generates a LiveKit access token for a participant.
 * @param {object} params
 * @param {string} params.userId - Becomes the LiveKit `identity`.
 * @param {string} params.roomName
 * @param {boolean} [params.isHost=false]
 * @param {boolean} [params.canPublish] - Defaults to `isHost`.
 * @param {string} [params.participantName]
 * @param {Record<string, unknown>} [params.metadata]
 * @returns {Promise<{ token: string, url: string, identity: string }>}
 * @throws {ApiError} 500 when LiveKit is not configured.
 */
export async function issueToken({ userId, roomName, isHost = false, canPublish, participantName, metadata }) {
  if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
    throw ApiError.internal('LIVEKIT_NOT_CONFIGURED');
  }
  const publish = canPublish ?? isHost;

  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: userId,
    name: participantName || userId,
    ttl: '1h',
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: publish,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  const token = await at.toJwt();
  return { token, url: config.livekit.url, identity: userId };
}

export default { issueToken };
