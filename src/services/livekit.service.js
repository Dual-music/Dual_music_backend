import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file LiveKit access-token service.
 *
 * Issues short-lived LiveKit JWTs for a room (duel / live / concert /
 * competition). The caller's user id is the participant `identity` (suffixed
 * by a per-device id, see {@link buildIdentity}). Grants are derived from the
 * requested role AND verified against the database: **hosts/publishers** may
 * publish audio/video only on rooms they own (artist of the live/concert,
 * duel slot owner, competition manager/approved candidate, accepted live
 * guest); **viewers** may only subscribe. Everyone may publish data messages
 * (used for lightweight in-room signalling). Mirrors the frontend
 * `livekit-token` edge function contract: `{ roomName, isHost, participantName,
 * canPublish, deviceId } → { token, url, identity }`.
 *
 * @module services/livekit.service
 */

/** Séparateur identité LiveKit `userId#deviceId` (voir {@link buildIdentity}). */
export const IDENTITY_SEPARATOR = '#';

/**
 * Identité LiveKit d'une connexion. Le SFU n'accepte qu'UNE connexion par identité et par
 * room : avec `identity = userId`, le même compte ouvert sur le web ET sur le mobile (ou dans
 * deux onglets) se faisait éjecter en boucle (`DUPLICATE_IDENTITY`) — source de pertes audio
 * « aléatoires ». Le suffixe par appareil rend chaque connexion unique ; `userId` reste
 * récupérable via {@link userIdFromIdentity}.
 * @param {string} userId
 * @param {string|undefined|null} deviceId
 * @returns {string}
 */
export function buildIdentity(userId, deviceId) {
  const dev = typeof deviceId === 'string' ? deviceId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : '';
  return dev ? `${userId}${IDENTITY_SEPARATOR}${dev}` : userId;
}

/**
 * Inverse de {@link buildIdentity}.
 * @param {string} identity
 * @returns {string}
 */
export function userIdFromIdentity(identity) {
  return String(identity).split(IDENTITY_SEPARATOR)[0];
}

const UUID_RE = '[0-9a-fA-F-]{36}';

/**
 * Vérifie que `userId` a le droit de PUBLIER (et/ou d'administrer) `roomName`. Les
 * conventions de nommage sont celles des clients (voir `recording.service.js#livekitRoomName`) :
 *  - `live-<id>`                      → l'artiste du live, ou un invité ACCEPTÉ (room UNIQUE :
 *                                       hôte et invités publient tous dans la même room) ;
 *  - `live-guest-<liveId>-<userId>`   → (ancienne architecture, conservée pour les clients
 *                                       pas encore mis à jour) cet utilisateur s'il est accepté ;
 *  - `concert-<id>`                   → l'artiste du concert ;
 *  - `comp-<id>` / `livekit_room`     → le manager de la compétition ou un candidat approuvé ;
 *  - `<room_id|duel-<id>>-artist1|artist2|manager` → le titulaire du slot.
 * Les admins/modérateurs plateforme peuvent publier partout (support/modération).
 * Un simple abonnement (`canPublish: false`) n'est jamais soumis à ce contrôle.
 * @param {string} userId
 * @param {string[]} roles
 * @param {string} roomName
 * @returns {Promise<{ allowed: boolean, isOwner: boolean }>}
 */
export async function authorizePublish(userId, roles, roomName) {
  if (roles.includes('admin') || roles.includes('moderator')) return { allowed: true, isOwner: true };

  let m;
  if ((m = roomName.match(new RegExp(`^live-guest-(${UUID_RE})-(${UUID_RE})$`)))) {
    const [, liveId, guestId] = m;
    if (guestId !== userId) return { allowed: false, isOwner: false };
    const accepted = await db.LiveJoinRequest.count({ where: { live_id: liveId, user_id: userId, status: 'accepted' } });
    return { allowed: accepted > 0, isOwner: false };
  }
  if ((m = roomName.match(new RegExp(`^live-(${UUID_RE})$`)))) {
    const liveId = m[1];
    const live = await db.ArtistLive.findByPk(liveId, { attributes: ['artist_id'], raw: true });
    if (!live) return { allowed: false, isOwner: false };
    if (live.artist_id === userId) return { allowed: true, isOwner: true };
    const accepted = await db.LiveJoinRequest.count({ where: { live_id: liveId, user_id: userId, status: 'accepted' } });
    return { allowed: accepted > 0, isOwner: false };
  }
  if ((m = roomName.match(new RegExp(`^concert-(${UUID_RE})$`)))) {
    const concert = await db.ArtistConcert.findByPk(m[1], { attributes: ['artist_id'], raw: true });
    const owner = !!concert && concert.artist_id === userId;
    return { allowed: owner, isOwner: owner };
  }
  if ((m = roomName.match(/^(.+)-(artist1|artist2|manager)$/))) {
    const [, base, slot] = m;
    const attrs = ['artist1_id', 'artist2_id', 'manager_id', 'room_id'];
    // `duel-<id>-<slot>` (convention par défaut) ou `<duels.room_id>-<slot>` (room personnalisée).
    const byId = base.match(new RegExp(`^duel-(${UUID_RE})$`));
    const duel = byId
      ? await db.Duel.findByPk(byId[1], { attributes: attrs, raw: true })
      : await db.Duel.findOne({ where: { room_id: base }, attributes: attrs, raw: true });
    if (!duel) return { allowed: false, isOwner: false };
    const expected = slot === 'artist1' ? duel.artist1_id : slot === 'artist2' ? duel.artist2_id : duel.manager_id;
    const ok = !!expected && expected === userId;
    return { allowed: ok, isOwner: ok && slot === 'manager' };
  }
  // Compétition : `comp-<id>` ou la valeur libre `competitions.livekit_room`.
  let competition = null;
  if ((m = roomName.match(new RegExp(`^comp-(${UUID_RE})$`)))) {
    competition = await db.Competition.findByPk(m[1], { attributes: ['id', 'manager_id'], raw: true });
  } else {
    competition = await db.Competition.findOne({ where: { livekit_room: roomName }, attributes: ['id', 'manager_id'], raw: true });
  }
  if (competition) {
    if (competition.manager_id === userId) return { allowed: true, isOwner: true };
    const approved = await db.CompetitionCandidate.count({
      where: { competition_id: competition.id, artist_id: userId, status: 'approved' },
    });
    return { allowed: approved > 0, isOwner: false };
  }
  return { allowed: false, isOwner: false };
}

/**
 * Generates a LiveKit access token for a participant.
 * @param {object} params
 * @param {string} params.userId - Becomes the LiveKit `identity` (with the device suffix).
 * @param {string[]} [params.roles=[]] - Caller's platform roles (admin bypass).
 * @param {string} params.roomName
 * @param {boolean} [params.isHost=false]
 * @param {boolean} [params.canPublish] - Defaults to `isHost`.
 * @param {string} [params.participantName]
 * @param {string} [params.deviceId] - Stable per-device/tab id (see {@link buildIdentity}).
 * @param {Record<string, unknown>} [params.metadata]
 * @returns {Promise<{ token: string, url: string, identity: string }>}
 * @throws {ApiError} 500 when LiveKit is not configured; 403 when publishing is requested on a
 *   room the caller does not own.
 */
export async function issueToken({ userId, roles = [], roomName, isHost = false, canPublish, participantName, deviceId, metadata }) {
  if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
    throw ApiError.internal('LIVEKIT_NOT_CONFIGURED');
  }
  let publish = canPublish ?? isHost;
  let admin = false;
  if (publish || isHost) {
    const { allowed, isOwner } = await authorizePublish(userId, roles, roomName);
    if (!allowed) throw ApiError.forbidden('FORBIDDEN', { details: { reason: 'not_room_publisher', roomName } });
    admin = isHost && isOwner;
  }
  publish = Boolean(publish);

  const identity = buildIdentity(userId, deviceId);
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name: participantName || userId,
    ttl: '1h',
    metadata: JSON.stringify({ ...(metadata || {}), userId }),
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: publish,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: admin,
  });

  const token = await at.toJwt();
  return { token, url: config.livekit.url, identity };
}

let roomService = null;
/**
 * Client d'administration des rooms (mémoïsé), ou `null` si LiveKit n'est pas configuré.
 * L'URL `ws(s)://` du SFU devient `http(s)://` pour l'API Twirp.
 * @returns {RoomServiceClient|null}
 */
function getRoomService() {
  if (roomService) return roomService;
  const { url, apiKey, apiSecret } = config.livekit;
  if (!url || !apiKey || !apiSecret) return null;
  const httpUrl = url.replace(/^ws/i, 'http');
  roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  return roomService;
}

/**
 * Accorde ou retire À CHAUD le droit de publier à un invité déjà connecté à la room unique
 * `live-<liveId>` (toutes ses connexions : `userId` ou `userId#device`). Permet à un invité
 * accepté de monter sur scène sans se reconnecter, et coupe immédiatement caméra/micro d'un
 * invité retiré (le SFU dépublie ses pistes dès que `canPublish` tombe). Best-effort : un échec
 * (LiveKit injoignable, participant déjà parti) est journalisé, jamais remonté — le client sait
 * de toute façon se reconnecter avec un jeton frais si la permission manque.
 * @param {string} liveId
 * @param {string} userId
 * @param {boolean} allowed
 * @returns {Promise<void>}
 */
export async function setLiveGuestPublish(liveId, userId, allowed) {
  const svc = getRoomService();
  if (!svc) return;
  const room = `live-${liveId}`;
  try {
    const participants = await svc.listParticipants(room);
    const mine = participants.filter((p) => userIdFromIdentity(p.identity) === userId);
    await Promise.all(
      mine.map((p) =>
        svc.updateParticipant(room, p.identity, undefined, {
          canPublish: allowed,
          canSubscribe: true,
          canPublishData: true,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err: err?.message, liveId, userId, allowed }, 'livekit: setLiveGuestPublish failed');
  }
}

export default { issueToken, authorizePublish, buildIdentity, userIdFromIdentity, setLiveGuestPublish };
