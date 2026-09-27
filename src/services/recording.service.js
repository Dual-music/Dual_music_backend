import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import ffmpegPath from 'ffmpeg-static';
import { Op } from 'sequelize';
import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  ImageFileSuffix,
  ImageOutput,
  S3Upload,
} from 'livekit-server-sdk';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { issueToken } from './livekit.service.js';
import { db } from '../models/index.js';
import { roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { createReplay } from './replay.service.js';
import { getStorageDriver } from './storage/index.js';

/**
 * @file Server-side live recording via **LiveKit Egress** → R2/S3, for replays.
 *
 * On go-live we start a `RoomCompositeEgress` that records the whole room
 * (composited, all publishers) to a deterministic object key. LiveKit has no
 * native pause: a host "pause" stops the current egress and "resume" starts a
 * FRESH one under the same `stream_recordings` session — each start/stop cycle
 * is a **segment** (`stream_recordings.segments`, JSON). On save, once every
 * segment's webhook (`egress_ended`) has landed, the segments are concatenated
 * (ffmpeg, stream-copy — same encoder settings across segments, no re-encode)
 * into ONE final file and turned into a `replay_videos` row (draft: `is_public:
 * false`, the host sets a price and publishes from their panel).
 *
 * The whole module is **best-effort and gated** for the AUTOMATIC (go-live)
 * trigger: if `LIVEKIT_EGRESS_ENABLED` is false or storage/LiveKit is not
 * configured, every entry point is a no-op — a recording failure must never
 * break a go-live. The MANUAL trigger (host buttons) opts into `strict: true`
 * instead, surfacing a real error to the UI rather than a silent no-op. This
 * works identically whether the host publishes from web or mobile (the server
 * records the room, not a client tab).
 *
 * @module services/recording.service
 */

/** Types d'événement enregistrables → room LiveKit. */
const RECORDABLE = new Set(['duel', 'concert', 'competition', 'live']);

/**
 * Nom de la room **LiveKit** (SFU) réellement rejointe par les clients pour CE type
 * d'événement — PAS forcément le même nom que la room **Socket.IO** (`roomName()`
 * ci-dessus, convention `"type:id"` utilisée pour les namespaces `/chat` et `/live`).
 * Vérifié empiriquement pour le concert (`"twirp error unknown: requested room does not
 * exist"` tant que l'egress ciblait la convention Socket.IO au lieu de la vraie room) ; même
 * audit fait pour live/compétition/duel avant d'activer leurs boutons d'enregistrement :
 *
 *  - **concert** : web `ConcertLive.tsx` / mobile `ConcertRoomViewModel.kt` → `concert-<id>`.
 *  - **live** : web `LiveStream.tsx` (`roomId = \`live-${id}\``) / mobile `Live.liveKitRoom`
 *    (`shared-domain` : le backend ne renseigne jamais `room_id`, dérivé côté client) →
 *    `live-<id>`.
 *  - **competition** : web `CompetitionLiveStage.tsx` (`competition.livekit_room ||
 *    \`comp-${id}\``) / mobile `CompetitionRoomScreen.kt` (même repli) → `comp-<id>` — la colonne
 *    `livekit_room` n'est jamais renseignée en pratique, donc TOUJOURS le repli. Note : ni le
 *    mot ("comp", pas "competition") ni le séparateur ne correspondaient à `roomName()`.
 *  - **duel** : PAS de room unique — chaque artiste + le manager publient chacun dans SA
 *    PROPRE room (`duel-<id>-artist1` / `-artist2` / `-manager`, web `DuelLive.tsx` / mobile
 *    `DuelViewModel.kt`), aucune ne contient les deux artistes ensemble. Aucun composite SFU
 *    natif n'est donc possible : l'enregistrement passe par un navigateur headless qui rejoint
 *    directement les rooms des deux artistes en lecture seule et les affiche côte à côte (voir
 *    `buildDuelRecordingUrl` / `startWebEgress` ci-dessous). Le nom retourné ici n'est qu'une
 *    étiquette DB (`stream_recordings.room_name`), jamais une vraie room LiveKit rejointe.
 *  - **live avec invités** : `live-<id>` ne contient QUE l'hôte — chaque invité accepté publie
 *    dans SA PROPRE room (`live-guest-<liveId>-<guestUserId>`, web `GuestVideoBox.tsx`), donc un
 *    `RoomCompositeEgress` sur `live-<id>` seul les manquerait tous. Même stratégie que le duel :
 *    navigateur headless (voir `buildLiveRecordingUrl`), qui en plus interroge périodiquement la
 *    liste des invités actuellement acceptés (elle varie en cours de direct, contrairement au
 *    duel à 2 rooms fixes) pour rejoindre/quitter leurs rooms en temps réel.
 * @param {string} sourceType
 * @param {string} sourceId
 * @returns {string}
 */
function livekitRoomName(sourceType, sourceId) {
  if (sourceType === 'concert') return `concert-${sourceId}`;
  if (sourceType === 'live') return `live-${sourceId}`;
  if (sourceType === 'competition') return `comp-${sourceId}`;
  if (sourceType === 'duel') return `duel-${sourceId}-recording`;
  return roomName(sourceType, sourceId);
}

let egressClient = null;
/** Client Egress mémoïsé, ou null si non configuré. */
function getEgressClient() {
  if (egressClient) return egressClient;
  const { url, apiKey, apiSecret } = config.livekit;
  if (!url || !apiKey || !apiSecret) return null;
  egressClient = new EgressClient(url, apiKey, apiSecret);
  return egressClient;
}

/** Vrai si l'enregistrement serveur est activé ET le stockage S3/R2 est configuré. */
function egressReady() {
  const s3 = config.s3;
  return (
    config.livekit.egressEnabled === true &&
    !!getEgressClient() &&
    !!s3.bucket &&
    !!s3.accessKeyId &&
    !!s3.secretAccessKey &&
    !!s3.publicBaseUrl
  );
}

/** Cible S3/R2 pour la sortie de l'egress (mêmes creds que l'upload média). */
function s3Output() {
  const s3 = config.s3;
  return new S3Upload({
    accessKey: s3.accessKeyId,
    secret: s3.secretAccessKey,
    bucket: s3.bucket,
    region: s3.region || 'auto',
    endpoint: s3.endpoint || undefined,
    forcePathStyle: true,
  });
}

/** URL publique déterministe d'un objet stocké (base publique + clé). */
function publicUrl(filePath) {
  const base = String(config.s3.publicBaseUrl || '').replace(/\/+$/, '');
  return `${base}/${filePath.replace(/^\/+/, '')}`;
}

/** Préfixe de la vignette dérivé de la clé vidéo (`replays/...mp4` → `thumbnails/...`). */
function thumbBase(filePath) {
  return filePath.replace(/^replays\//, 'thumbnails/').replace(/\.mp4$/i, '');
}

/**
 * Vignette réelle (frame vidéo) issue du webhook egress, uniquement si LiveKit a produit un
 * vrai fichier image → jamais d'URL cassée (repli couverture géré par l'appelant).
 */
function thumbnailFromEgress(egressInfo) {
  const results = egressInfo?.imageResults || [];
  for (const r of results) {
    const key = r?.filename || '';
    if (key && /\.(jpe?g|png|webp)$/i.test(key)) return publicUrl(key);
  }
  return null;
}

/**
 * Mode d'enregistrement par type d'événement, choisi par l'admin :
 *  - `off`    : aucun enregistrement possible.
 *  - `auto`   : enregistrement automatique au passage en live.
 *  - `manual` : l'hôte/manager lance l'enregistrement quand il le veut.
 * Réglage `recording_config` = `{ live, duel, concert, competition }`. Défaut : `off`.
 * @param {string} sourceType
 * @returns {Promise<'off'|'auto'|'manual'>}
 */
export async function getRecordingMode(sourceType) {
  try {
    const row = await db.PlatformSetting.findByPk('recording_config', { raw: true });
    const mode = row?.value?.[sourceType];
    return mode === 'auto' || mode === 'manual' ? mode : 'off';
  } catch {
    return 'off';
  }
}

/** Statuts non terminaux : une session dans l'un de ces états bloque un nouveau démarrage. */
const OPEN_STATUSES = ['pending', 'active', 'paused', 'stopping', 'concatenating'];

/**
 * Construit l'URL « vue enregistrement » d'un duel (page web dédiée, sans chrome, qui affiche
 * les deux artistes côte à côte) + mint un jeton de visionnage (lecture seule) pour chacune de
 * leurs rooms LiveKit — embarqués dans l'URL en query params, pour que le navigateur headless de
 * l'egress puisse se connecter SANS jamais appeler une route authentifiée (il n'a ni cookies ni
 * JWT utilisateur).
 *
 * C'est la seule façon d'enregistrer un duel « composite » : chaque artiste publie dans SA
 * PROPRE room LiveKit (`duel-<id>-artist1` / `-artist2`), il n'existe aucune room unique
 * contenant les deux — LiveKit sait en revanche piloter un vrai navigateur (`startWebEgress`)
 * qui, lui, peut se connecter aux deux rooms et les afficher composées, exactement comme un
 * spectateur le ferait.
 * @param {string} duelId
 * @returns {Promise<string|null>} null si le duel est introuvable ou n'a pas ses deux artistes.
 */
async function buildDuelRecordingUrl(duelId) {
  const duel = await db.Duel.findByPk(duelId, { attributes: ['id', 'artist1_id', 'artist2_id'], raw: true });
  if (!duel?.artist1_id || !duel?.artist2_id) return null;
  const base = String(config.webEgressBaseUrl || '').replace(/\/+$/, '');
  if (!base) return null;

  const [t1, t2] = await Promise.all([
    issueToken({ userId: `egress-recording-${duelId}`, roomName: `duel-${duelId}-artist1`, isHost: false, canPublish: false }),
    issueToken({ userId: `egress-recording-${duelId}`, roomName: `duel-${duelId}-artist2`, isHost: false, canPublish: false }),
  ]);
  const qs = new URLSearchParams({ u: t1.url, t1: t1.token, t2: t2.token });
  return `${base}/duel/${duelId}/recording-view?${qs.toString()}`;
}

/**
 * Clé signée (HMAC, `TOKEN_HASH_SECRET`) prouvant que l'appelant d'une route « vue enregistrement
 * live » a bien reçu cette URL du serveur (embarquée en query param) — ces routes n'ont ni
 * cookies ni JWT utilisateur (navigateur headless) et exposent des jetons de visionnage vidéo,
 * donc ne peuvent pas rester ouvertes sans un minimum de vérification : sans cette clé, connaître
 * juste un `liveId` + `recordingId` (un UUID mais potentiellement partagé) suffirait à lister/
 * regarder les flux de tous les invités d'un live.
 * @param {string} liveId @param {string} recordingId
 * @returns {string}
 */
function liveRecordingKey(liveId, recordingId) {
  return createHmac('sha256', config.jwt.tokenHashSecret).update(`live-recording:${liveId}:${recordingId}`).digest('hex').slice(0, 32);
}

/**
 * Construit l'URL « vue enregistrement » d'un live (page web dédiée, sans chrome) + mint un
 * jeton de visionnage pour la room de l'hôte. Contrairement au duel (2 rooms fixes connues à
 * l'avance), un live peut gagner/perdre des invités EN COURS d'enregistrement — la page elle-même
 * interroge donc `GET /recordings/live/:liveId/guests` en continu (voir `getLiveRecordingGuests`)
 * au lieu de recevoir tous les jetons d'un coup ici.
 * @param {string} liveId @param {string} recordingId - `stream_recordings.id` de CETTE session.
 * @returns {Promise<string|null>} null si le live est introuvable ou `WEB_EGRESS_BASE_URL` absent.
 */
async function buildLiveRecordingUrl(liveId, recordingId) {
  const live = await db.ArtistLive.findByPk(liveId, { attributes: ['id'], raw: true });
  if (!live) return null;
  const base = String(config.webEgressBaseUrl || '').replace(/\/+$/, '');
  if (!base) return null;

  const host = await issueToken({ userId: `egress-recording-${liveId}`, roomName: `live-${liveId}`, isHost: false, canPublish: false });
  const key = liveRecordingKey(liveId, recordingId);
  const qs = new URLSearchParams({ u: host.url, t0: host.token, rid: recordingId, key });
  return `${base}/live/${liveId}/recording-view?${qs.toString()}`;
}

/**
 * Liste des invités actuellement acceptés sur un live (`live_join_requests.status = 'accepted'`)
 * + un jeton de visionnage (lecture seule) pour la room de chacun. Appelée en continu par la
 * page « vue enregistrement » headless pour suivre les arrivées/départs d'invités pendant que
 * l'enregistrement tourne. Non authentifiée (le navigateur headless n'a pas de session) : protégée
 * par `key` (voir `liveRecordingKey`).
 * @param {{ liveId: string, recordingId: string, key: string }} p
 * @returns {Promise<{ userId: string, url: string, token: string }[]>}
 * @throws {ApiError} 403 si `key` invalide.
 */
export async function getLiveRecordingGuests({ liveId, recordingId, key }) {
  if (!liveId || !recordingId || key !== liveRecordingKey(liveId, recordingId)) throw ApiError.forbidden('FORBIDDEN');
  const rows = await db.LiveJoinRequest.findAll({
    where: { live_id: liveId, status: 'accepted' },
    attributes: ['user_id'],
    raw: true,
  });
  return Promise.all(
    rows.map(async (r) => {
      const t = await issueToken({
        userId: `egress-recording-${liveId}`,
        roomName: `live-guest-${liveId}-${r.user_id}`,
        isHost: false,
        canPublish: false,
      });
      return { userId: r.user_id, url: t.url, token: t.token };
    }),
  );
}

/**
 * Démarre UN segment d'egress (premier démarrage ou reprise après pause) et retourne son
 * descripteur, à pousser dans `stream_recordings.segments`.
 * @param {import('sequelize').Model} rec - Ligne `stream_recordings` (session).
 * @param {number} seq - Numéro de séquence (1, 2, 3…).
 * @returns {Promise<{ seq: number, egressId: string|null, filePath: string, status: 'active' }>}
 * @throws {Error} duel : URL de la vue d'enregistrement indisponible (duel introuvable, ou
 *   `WEB_EGRESS_BASE_URL`/repli CORS non configuré — voir `config/env.js`).
 */
async function startEgressSegment(rec, seq) {
  const filePath = `replays/${rec.source_type}/${rec.source_id}/${rec.id}/seg-${seq}-${Date.now()}.mp4`;
  const fileOutput = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: filePath,
    disableManifest: true,
    output: { case: 's3', value: s3Output() },
  });
  // Miniature « pro » : une image extraite de la vidéo, rafraîchie périodiquement et
  // écrasée sur une clé unique (NONE_OVERWRITE) → la dernière frame sert de vignette.
  const imageOutput = new ImageOutput({
    captureInterval: 30,
    filenamePrefix: thumbBase(filePath),
    filenameSuffix: ImageFileSuffix.IMAGE_SUFFIX_NONE_OVERWRITE,
    disableManifest: true,
    output: { case: 's3', value: s3Output() },
  });

  let info;
  if (rec.source_type === 'duel') {
    // Pas de room composite unique pour un duel : navigateur headless sur la « vue
    // enregistrement » web (voir buildDuelRecordingUrl ci-dessus).
    const url = await buildDuelRecordingUrl(rec.source_id);
    if (!url) throw new Error('duel recording view URL unavailable (missing artists or WEB_EGRESS_BASE_URL)');
    info = await getEgressClient().startWebEgress(url, { file: fileOutput, images: imageOutput }, { awaitStartSignal: true });
  } else if (rec.source_type === 'live') {
    // Les invités publient chacun dans leur propre room, jamais `live-<id>` : même stratégie
    // navigateur headless que le duel (voir buildLiveRecordingUrl ci-dessus).
    const url = await buildLiveRecordingUrl(rec.source_id, rec.id);
    if (!url) throw new Error('live recording view URL unavailable (missing live or WEB_EGRESS_BASE_URL)');
    info = await getEgressClient().startWebEgress(url, { file: fileOutput, images: imageOutput }, { awaitStartSignal: true });
  } else {
    info = await getEgressClient().startRoomCompositeEgress(
      rec.room_name,
      { file: fileOutput, images: imageOutput },
      { layout: 'grid' },
    );
  }
  return { seq, egressId: info?.egressId ?? null, filePath, status: 'active' };
}

/**
 * Démarre l'enregistrement d'un direct (idempotent par source) : crée la session ET son
 * premier segment.
 *
 * En mode "best-effort" (`strict: false`, l'appel automatique au passage en live) : no-op
 * silencieux si egress off / mal configuré / mode admin qui l'interdit — un souci
 * d'enregistrement ne doit JAMAIS empêcher un go-live.
 *
 * En mode strict (`strict: true`, les boutons hôte) : cette même absence de config lève une
 * erreur explicite au lieu de renvoyer un succès muet.
 * @param {object} p
 * @param {'duel'|'concert'|'competition'|'live'} p.sourceType
 * @param {string} p.sourceId
 * @param {string} [p.artistId]
 * @param {string} [p.createdBy]
 * @param {Array<'auto'|'manual'>} [p.allowedModes=['auto']] - Modes sous lesquels ce
 *   déclencheur a le droit de lancer (go-live: `['auto']` ; boutons hôte: `['auto','manual']`).
 * @param {boolean} [p.strict=false] - Lève une erreur au lieu d'un no-op silencieux.
 * @returns {Promise<void>}
 * @throws {ApiError} 400 (`strict` uniquement) si non configuré / déjà en cours / échec.
 */
export async function startRecording({ sourceType, sourceId, artistId, createdBy, allowedModes = ['auto'], strict = false }) {
  if (!RECORDABLE.has(sourceType) || !sourceId) return;
  if (!egressReady()) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_CONFIGURED');
    return;
  }
  const mode = await getRecordingMode(sourceType);
  if (!allowedModes.includes(mode)) {
    if (strict) throw ApiError.badRequest('RECORDING_MODE_DISABLED', { details: { mode } });
    return;
  }
  // Idempotence : ne pas relancer si une session est déjà ACTIVE/EN PAUSE pour cette source.
  // Ne bloque PAS sur 'stopping'/'concatenating' : la compétition enchaîne les créneaux en
  // arrêtant le précédent puis en démarrant le suivant tout de suite (voir
  // `competition.service.js`), sans attendre que le webhook du précédent ait fini de recoller —
  // bloquer ici casserait l'enregistrement par créneau.
  const existing = await db.StreamRecording.findOne({
    where: { source_type: sourceType, source_id: sourceId, status: ['pending', 'active', 'paused'] },
  });
  if (existing) {
    if (strict) throw ApiError.badRequest('RECORDING_ALREADY_ACTIVE');
    return;
  }

  const room = livekitRoomName(sourceType, sourceId);
  const finalFilePath = `replays/${sourceType}/${sourceId}/${Date.now()}-final.mp4`;
  const rec = await db.StreamRecording.create({
    room_name: room,
    source_type: sourceType,
    source_id: sourceId,
    artist_id: artistId ?? null,
    created_by: createdBy ?? artistId ?? null,
    file_path: finalFilePath,
    final_file_path: finalFilePath,
    status: 'pending',
    segments: [],
    accumulated_seconds: 0,
  });

  try {
    const seg = await startEgressSegment(rec, 1);
    rec.egress_id = seg.egressId;
    rec.file_path = seg.filePath;
    rec.segments = [seg];
    rec.status = 'active';
    rec.started_at = new Date();
    rec.run_started_at = new Date();
    await rec.save();
    logger.info({ egressId: rec.egress_id, room, sourceType, sourceId }, 'egress started');
  } catch (err) {
    logger.warn({ err: err?.message, sourceType, sourceId }, 'egress start failed');
    rec.status = 'failed';
    rec.error = String(err?.message || err).slice(0, 500);
    rec.ended_at = new Date();
    await rec.save().catch(() => {});
    if (strict) throw ApiError.badRequest('RECORDING_START_FAILED', { details: { message: err?.message } });
  }
}

/**
 * Lit UNE ligne `stream_recordings` sous verrou de ligne (transaction + `SELECT ... FOR UPDATE`),
 * applique `mutator`, sauvegarde, puis relâche le verrou.
 *
 * Indispensable dès qu'une action hôte (pause/reprise/annuler/sauvegarder) et le webhook egress
 * (`finalizeFromEgress`) peuvent viser la MÊME session à quelques centaines de ms d'intervalle —
 * ce qui arrive dès qu'un hôte reprend un enregistrement juste après l'avoir mis en pause. Sans
 * verrou, chacun lit sa propre copie de `segments`/`status` puis sauvegarde la SIENNE en entier :
 * celui qui sauvegarde en dernier écrase silencieusement les changements de l'autre. Constaté en
 * conditions réelles : le webhook marquait bien un segment `failed` (confirmé « 200 OK » côté
 * LiveKit), mais `resumeRecording`, ayant lu `segments` juste AVANT, sauvegardait ensuite sa
 * propre copie (ce segment encore `active`) — le segment restait `active` pour toujours, la
 * condition « tous les segments sont clos » n'était jamais vraie, et la sauvegarde restait
 * bloquée sur « Finalisation… » indéfiniment.
 * @param {import('sequelize').WhereOptions} where
 * @param {(rec: import('sequelize').Model) => void | Promise<void>} mutator
 * @param {{ order?: any }} [options]
 * @returns {Promise<import('sequelize').Model|null>} la ligne sauvegardée, ou `null` si `where` ne matche plus rien.
 */
async function mutateRecording(where, mutator, options = {}) {
  return db.sequelize.transaction(async (t) => {
    const rec = await db.StreamRecording.findOne({ where, ...options, transaction: t, lock: t.LOCK.UPDATE });
    if (!rec) return null;
    await mutator(rec);
    await rec.save({ transaction: t });
    return rec;
  });
}

/**
 * Met en pause l'enregistrement en cours : arrête le segment actif (l'egress LiveKit n'a pas
 * de vraie pause) ; `resumeRecording` en démarrera un nouveau à la reprise. Best-effort si
 * `strict` est faux.
 * @param {{ sourceType: string, sourceId: string, strict?: boolean }} p
 * @returns {Promise<void>}
 * @throws {ApiError} 400 (`strict`) si rien n'est actif.
 */
export async function pauseRecording({ sourceType, sourceId, strict = false }) {
  let egressIdToStop = null;
  const rec = await mutateRecording({ source_type: sourceType, source_id: sourceId, status: 'active' }, (r) => {
    // Comptabilise le temps du segment en cours AVANT de couper — le webhook confirmera/corrigera
    // la durée exacte du segment plus tard, mais le chrono affiché à l'artiste ne doit pas attendre
    // cette confirmation asynchrone.
    if (r.run_started_at) {
      r.accumulated_seconds += Math.round((Date.now() - new Date(r.run_started_at).getTime()) / 1000);
    }
    egressIdToStop = r.egress_id;
    r.run_started_at = null;
    r.status = 'paused';
  });
  if (!rec) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_ACTIVE');
    return;
  }
  // Arrêt de l'egress : BEST-EFFORT, jamais bloquant. Le statut « paused » est déjà enregistré
  // — c'est l'effet qui compte pour l'hôte — donc un échec ici (egress déjà arrêté/introuvable
  // côté LiveKit, aléa réseau) ne doit PAS faire échouer la réponse HTTP. Sinon le client reçoit
  // une erreur, n'applique jamais le nouvel état, et reste bloqué à afficher « actif » alors que
  // la BDD est déjà en pause — la pause semblait alors « ne pas prendre » alors qu'elle avait
  // réellement eu lieu (un webhook orphelin viendra de toute façon clore ce segment plus tard).
  // NE PAS `await` cet appel : le laisser dans le vol ci-dessous répond à l'hôte dès la BDD à
  // jour, sans attendre l'aller-retour réseau LiveKit — sinon le bouton « pause » paraît lent
  // (plusieurs secondes) alors que l'effet côté hôte devrait être instantané.
  if (egressIdToStop) {
    getEgressClient()
      .stopEgress(egressIdToStop)
      .catch((err) => {
        logger.warn({ err: err?.message, egressId: egressIdToStop }, 'pause: egress stop failed (best-effort)');
      });
  }
}

/**
 * Reprend un enregistrement en pause : démarre un NOUVEAU segment sous la même session.
 * @param {{ sourceType: string, sourceId: string, strict?: boolean }} p
 * @returns {Promise<void>}
 * @throws {ApiError} 400 (`strict`) si rien n'est en pause / échec du redémarrage.
 */
export async function resumeRecording({ sourceType, sourceId, strict = false }) {
  const existing = await db.StreamRecording.findOne({ where: { source_type: sourceType, source_id: sourceId, status: 'paused' } });
  if (!existing) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_PAUSED');
    return;
  }
  if (!egressReady()) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_CONFIGURED');
    return;
  }
  try {
    const segments = existing.segments || [];
    const nextSeq = (segments[segments.length - 1]?.seq || 0) + 1;
    // Appel externe (LiveKit) lent (observé : plusieurs secondes) — volontairement HORS verrou
    // (voir mutateRecording) pour ne pas bloquer un webhook concurrent pendant tout ce temps.
    const seg = await startEgressSegment(existing, nextSeq);
    // Ré-écrit sur la version LA PLUS FRAÎCHE de `segments` (verrouillée) — PAS sur `segments`
    // capturé ci-dessus avant l'appel LiveKit : un webhook de clôture du segment précédent a pu
    // arriver entre-temps, et écrire par-dessus sa mise à jour perdrait ce statut pour toujours
    // (c'est exactement le bug constaté : la sauvegarde restait bloquée sur « Finalisation… »).
    const rec = await mutateRecording({ id: existing.id, status: 'paused' }, (r) => {
      r.segments = [...(r.segments || []), seg];
      r.egress_id = seg.egressId;
      r.file_path = seg.filePath;
      r.run_started_at = new Date();
      r.status = 'active';
    });
    if (!rec) throw new Error('recording state changed concurrently (no longer paused)');
    logger.info({ egressId: seg.egressId, seq: nextSeq, sourceType, sourceId }, 'egress resumed (new segment)');
  } catch (err) {
    logger.warn({ err: err?.message, sourceType, sourceId }, 'resume failed');
    if (strict) throw ApiError.badRequest('RECORDING_RESUME_FAILED', { details: { message: err?.message } });
  }
}

/**
 * Annule tout l'enregistrement en cours (aucun replay créé) : arrête le segment actif s'il y en
 * a un, marque la session `cancelled`, et supprime au mieux les segments déjà envoyés au
 * stockage (ils ne seront jamais recollés/publiés).
 * @param {{ sourceType: string, sourceId: string, strict?: boolean }} p
 * @returns {Promise<void>}
 * @throws {ApiError} 400 (`strict`) si rien à annuler.
 */
export async function cancelRecording({ sourceType, sourceId, strict = false }) {
  let egressIdToStop = null;
  let segmentsToDelete = [];
  let recId = null;
  const rec = await mutateRecording(
    { source_type: sourceType, source_id: sourceId, status: ['pending', 'active', 'paused', 'stopping'] },
    (r) => {
      egressIdToStop = r.status === 'active' || r.status === 'stopping' ? r.egress_id : null;
      segmentsToDelete = r.segments || [];
      recId = r.id;
      r.status = 'cancelled';
      r.ended_at = new Date();
    },
  );
  if (!rec) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_ACTIVE');
    return;
  }
  // Fire-and-forget (voir pauseRecording) : ne pas faire attendre l'hôte le temps de l'aller-retour LiveKit.
  if (egressIdToStop) {
    getEgressClient()
      ?.stopEgress(egressIdToStop)
      .catch((err) => {
        logger.warn({ err: err?.message, egressId: egressIdToStop }, 'cancel: egress stop failed');
      });
  }
  const driver = getStorageDriver();
  for (const seg of segmentsToDelete) {
    if (seg.filePath) await driver.delete(seg.filePath).catch(() => {});
  }
  logger.info({ recordingId: rec.id, sourceType, sourceId }, 'recording session cancelled');
}

/**
 * Termine et SAUVEGARDE l'enregistrement : arrête le segment actif s'il y en a un (le dernier
 * segment sera recollé dès son webhook `egress_ended` reçu), ou lance directement le recollage
 * si la session était déjà en pause (tous les segments sont déjà clos). No-op si egress off /
 * rien en cours (best-effort) — sauf `strict`, où l'échec est remonté à l'appelant.
 * @param {{ sourceType: string, sourceId: string, strict?: boolean }} p
 * @returns {Promise<void>}
 */
export async function stopRecording({ sourceType, sourceId, strict = false }) {
  if (!egressReady()) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_CONFIGURED');
    return;
  }
  let hadActiveSegment = false;
  let egressIdToStop = null;
  let recId = null;
  const rec = await mutateRecording(
    { source_type: sourceType, source_id: sourceId, status: ['pending', 'active', 'paused'] },
    (r) => {
      if (r.status === 'active' && r.run_started_at) {
        r.accumulated_seconds += Math.round((Date.now() - new Date(r.run_started_at).getTime()) / 1000);
      }
      hadActiveSegment = r.status === 'active' && !!r.egress_id;
      egressIdToStop = r.egress_id;
      recId = r.id;
      r.run_started_at = null;
      r.status = 'stopping';
    },
    { order: [['created_at', 'DESC']] },
  );
  if (!rec) {
    if (strict) throw ApiError.badRequest('RECORDING_NOT_ACTIVE');
    return;
  }
  try {
    if (hadActiveSegment) {
      // Arrêt de l'egress : BEST-EFFORT, jamais bloquant (même raison que pauseRecording — le
      // statut « stopping » est déjà enregistré, un échec ici ne doit pas faire échouer la
      // réponse HTTP et désynchroniser le client). Le webhook egress_ended du dernier segment
      // (ou, à défaut, le filet de sécurité périodique) déclenchera concatenateSession(). Pas de
      // `await` : l'hôte n'a pas à attendre l'aller-retour LiveKit pour voir « Sauvegarde… ».
      getEgressClient()
        .stopEgress(egressIdToStop)
        .catch((err) => {
          logger.warn({ err: err?.message, egressId: egressIdToStop }, 'save: egress stop failed (best-effort)');
        });
      logger.info({ egressId: egressIdToStop, sourceType, sourceId }, 'egress stop requested (save)');
    } else {
      // « Sauvegarder » demandé pendant une PAUSE : tous les segments précédents sont déjà
      // clos, on peut recoller immédiatement sans attendre de webhook. `concatenateSession`
      // gère déjà ses propres erreurs en interne (statut 'failed'), elle ne relève jamais ici.
      await concatenateSession(recId);
    }
  } catch (err) {
    // Ne devrait plus se produire pour l'arrêt d'egress (best-effort ci-dessus) ni pour
    // concatenateSession (gère ses propres erreurs) — reste un filet pour un imprévu avant la
    // sauvegarde du statut 'stopping' (ex. `rec.save()` lui-même).
    logger.warn({ err: err?.message, sourceType, sourceId }, 'save recording failed');
    if (strict) throw ApiError.badRequest('RECORDING_SAVE_FAILED', { details: { message: err?.message } });
  }
}

/** Concatène des fichiers MP4 de même encodage via le concat demuxer ffmpeg (stream-copy, rapide, pas de ré-encodage). */
function runFfmpegConcat(listFile, outputPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not available'));
    const proc = spawn(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath]);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Recolle les segments d'une session `stopping` dont TOUS les segments sont dans un état
 * terminal (`completed`/`failed`) en un fichier final, puis crée le `replay_videos` (brouillon,
 * non public — l'hôte fixe le prix et publie depuis son panel). Idempotent : no-op si la
 * session n'est plus `stopping` (déjà traitée, ou pas encore prête).
 * @param {string} recordingId
 * @returns {Promise<void>}
 */
export async function concatenateSession(recordingId) {
  const rec = await db.StreamRecording.findByPk(recordingId);
  if (!rec || rec.status !== 'stopping') return;
  rec.status = 'concatenating';
  await rec.save();

  const okSegments = (rec.segments || [])
    .filter((s) => s.status === 'completed' && s.filePath)
    .sort((a, b) => a.seq - b.seq);

  if (okSegments.length === 0) {
    rec.status = 'failed';
    rec.error = 'no valid segment to save';
    rec.ended_at = new Date();
    await rec.save().catch(() => {});
    return;
  }

  const totalDurationSec = okSegments.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  const driver = getStorageDriver();
  let finalKey = okSegments[0].filePath;
  let tmpDir = null;
  try {
    if (okSegments.length > 1) {
      // Plusieurs segments (au moins une pause a eu lieu) : télécharge chacun, recolle via
      // ffmpeg (concat demuxer, stream-copy — tous issus de la même config d'encodage egress,
      // donc pas besoin de ré-encoder), puis réuploade le résultat sous la clé finale.
      tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dm-rec-'));
      const localPaths = [];
      for (const seg of okSegments) {
        const buf = await driver.getFull(seg.filePath);
        const local = path.join(tmpDir, `seg-${seg.seq}.mp4`);
        await writeFile(local, buf);
        localPaths.push(local);
      }
      const listFile = path.join(tmpDir, 'list.txt');
      await writeFile(listFile, localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
      const outputLocal = path.join(tmpDir, 'final.mp4');
      await runFfmpegConcat(listFile, outputLocal);
      const finalBuf = await readFile(outputLocal);
      finalKey = rec.final_file_path || finalKey;
      await driver.putObject(finalKey, finalBuf, 'video/mp4');
    }
    // Segment unique (cas courant, aucune pause) : c'est déjà le fichier final, rien à recoller.

    const replay = await createReplay(rec.created_by || rec.artist_id, {
      sourceType: rec.source_type,
      eventId: rec.source_id,
      artistId: rec.artist_id || rec.created_by,
      title: await recordingTitle(rec),
      videoUrl: publicUrl(finalKey),
      thumbnailUrl: (await eventCover(rec.source_type, rec.source_id)) || null,
      duration: String(totalDurationSec),
      // Brouillon : l'artiste doit lui-même fixer un prix et publier depuis son panel
      // (demande explicite — avant, `is_public: true` publiait automatiquement).
      isPublic: false,
      recordedDate: rec.started_at || rec.created_at,
    });

    rec.status = 'completed';
    rec.replay_id = replay.id;
    rec.final_file_path = finalKey;
    rec.ended_at = new Date();
    await rec.save();
    logger.info({ recordingId: rec.id, replayId: replay.id, segments: okSegments.length }, 'recording session finalized');

    // Nettoyage best-effort des segments intermédiaires devenus inutiles (jamais bloquant : un
    // échec ici laisse juste un objet orphelin dans le stockage, sans conséquence fonctionnelle).
    if (okSegments.length > 1) {
      for (const seg of okSegments) {
        if (seg.filePath !== finalKey) await driver.delete(seg.filePath).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err: err?.message, recordingId: rec.id }, 'recording concat/finalize failed');
    rec.status = 'failed';
    rec.error = String(err?.message || err).slice(0, 500);
    rec.ended_at = new Date();
    await rec.save().catch(() => {});
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Retrouve la session `stream_recordings` portant CE segment (par id d'egress) — recherche
 * directe par la colonne `egress_id` (mise à jour à chaque nouveau segment, donc pointe le
 * PLUS RÉCENT), avec repli sur les sessions non closes pour couvrir un webhook tardif d'un
 * segment plus ancien.
 * @param {string} egressId
 * @returns {Promise<import('sequelize').Model|null>}
 */
async function findRecordingByEgressId(egressId) {
  const direct = await db.StreamRecording.findOne({ where: { egress_id: egressId } });
  if (direct) return direct;
  const candidates = await db.StreamRecording.findAll({
    where: { status: ['active', 'paused', 'stopping', 'concatenating'] },
    limit: 200,
  });
  return candidates.find((r) => (r.segments || []).some((s) => s.egressId === egressId)) || null;
}

/**
 * Finalise UN SEGMENT à partir d'un `EgressInfo` reçu par webhook (egress_ended) : marque ce
 * segment `completed`/`failed` avec sa durée réelle, et — si la session est `stopping` et que
 * tous ses segments sont désormais dans un état terminal — déclenche le recollage final
 * ({@link concatenateSession}). Idempotent.
 * @param {object} egressInfo - `EgressInfo` LiveKit.
 * @returns {Promise<void>}
 */
export async function finalizeFromEgress(egressInfo) {
  const egressId = egressInfo?.egressId;
  if (!egressId) return;
  // Repérage en LECTURE SEULE (juste pour l'id) : la mutation elle-même relit sous verrou, voir
  // mutateRecording — c'est justement l'absence de cette relecture verrouillée qui causait le
  // bug (un `resumeRecording` concurrent écrasait ce que ce webhook venait d'écrire).
  const found = await findRecordingByEgressId(egressId);
  if (!found) return;

  const failed = egressInfo.status === EgressStatus.EGRESS_FAILED || egressInfo.status === EgressStatus.EGRESS_ABORTED;
  const file = (egressInfo.fileResults || egressInfo.file || [])[0] || {};
  const durationNs = Number(file.duration || egressInfo.duration || 0);
  const durationSec = durationNs > 0 ? Math.round(durationNs / 1e9) : 0;

  let updatedSeq = null;
  let sessionStatus = null;
  let allDone = false;
  const rec = await mutateRecording({ id: found.id }, (r) => {
    const segments = [...(r.segments || [])];
    const idx = segments.findIndex((s) => s.egressId === egressId);
    if (idx === -1) return;
    if (segments[idx].status === 'completed' || segments[idx].status === 'failed') return; // idempotent
    segments[idx] = { ...segments[idx], status: failed ? 'failed' : 'completed', durationSeconds: durationSec };
    r.segments = segments;
    updatedSeq = segments[idx].seq;
    sessionStatus = r.status;
    allDone = segments.every((s) => s.status === 'completed' || s.status === 'failed');
  });
  if (!rec || updatedSeq === null) return; // pas trouvé, ou déjà terminal (idempotent)
  logger.info({ egressId, sourceType: rec.source_type, seq: updatedSeq, status: failed ? 'failed' : 'completed' }, 'recording segment finalized');

  if (sessionStatus === 'stopping' && allDone) {
    await concatenateSession(rec.id).catch((err) => logger.error({ err: err?.message }, 'concat trigger failed'));
  }
}

/** Titre lisible du replay (« <Titre de l'événement> — Replay »), avec repli générique. */
async function recordingTitle(rec) {
  const generic = { duel: 'Duel', concert: 'Concert', competition: 'Compétition', live: 'Live' }[rec.source_type] || 'Direct';
  try {
    if (rec.source_type === 'concert') {
      const c = await db.ArtistConcert.findByPk(rec.source_id, { attributes: ['title'], raw: true }).catch(() => null);
      if (c?.title) return `${c.title} — Replay`;
    } else if (rec.source_type === 'competition') {
      const c = await db.Competition.findByPk(rec.source_id, { attributes: ['title'], raw: true }).catch(() => null);
      if (c?.title) return `${c.title} — Replay`;
    } else if (rec.source_type === 'live') {
      const l = await db.ArtistLive.findByPk(rec.source_id, { attributes: ['title'], raw: true }).catch(() => null);
      if (l?.title) return `${l.title} — Replay`;
    }
  } catch {
    /* repli générique */
  }
  return `${generic} — Replay`;
}

/** Miniature : réutilise l'image de couverture de l'événement quand elle existe. */
async function eventCover(sourceType, sourceId) {
  try {
    if (sourceType === 'concert') {
      const c = await db.ArtistConcert.findByPk(sourceId, { attributes: ['cover_image_url'], raw: true }).catch(() => null);
      return c?.cover_image_url || null;
    }
  } catch {
    /* pas de couverture */
  }
  return null;
}

/**
 * Filet de sécurité (job périodique) : rattrape les enregistrements dont le webhook a été
 * perdu (crash hôte, redémarrage, webhook manqué). Marque en échec les `pending` bloqués,
 * interroge l'egress réel pour les segments `active`/`stopping` en attente de confirmation, et
 * relance le recollage des sessions `stopping` dont tous les segments sont déjà clos (webhook
 * traité mais le recollage n'a jamais démarré / a échoué avant de changer le statut). No-op si
 * off.
 * @returns {Promise<{ pendingFailed: number, finalized: number, failed: number, concatRetried: number }>}
 */
export async function reconcileRecordings() {
  if (!egressReady()) return { pendingFailed: 0, finalized: 0, failed: 0, concatRetried: 0 };
  const client = getEgressClient();
  const now = Date.now();

  // 1) `pending` sans egress_id depuis > 10 min → l'appel de démarrage n'a jamais abouti.
  const stalePending = await db.StreamRecording.findAll({
    where: { status: 'pending', created_at: { [Op.lt]: new Date(now - 10 * 60 * 1000) } },
    limit: 100,
  });
  for (const r of stalePending) {
    r.status = 'failed';
    r.error = r.error || 'never started (reconcile)';
    r.ended_at = new Date();
    await r.save().catch(() => {});
  }

  // 2) `active`/`stopping` : on interroge l'egress réel du segment courant (webhook potentiellement perdu).
  const active = await db.StreamRecording.findAll({
    where: { status: ['active', 'stopping'], egress_id: { [Op.ne]: null } },
    limit: 100,
  });
  let finalized = 0;
  let failed = 0;
  for (const r of active) {
    try {
      const info = (await client.listEgress({ egressId: r.egress_id }))?.[0];
      if (!info) {
        // Egress introuvable et enregistrement ancien → on clôt en échec.
        if (now - new Date(r.started_at || r.created_at).getTime() > 12 * 3600 * 1000) {
          r.status = 'failed';
          r.error = 'egress not found (reconcile)';
          r.ended_at = new Date();
          await r.save().catch(() => {});
          failed += 1;
        }
        continue;
      }
      if (info.status === EgressStatus.EGRESS_COMPLETE) {
        await finalizeFromEgress(info);
        finalized += 1;
      } else if (info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED) {
        await finalizeFromEgress(info); // marque le SEGMENT en échec (pas toute la session)
        failed += 1;
      }
      // Sinon toujours en cours → on repassera au prochain tick.
    } catch (err) {
      logger.warn({ err: err?.message, egressId: r.egress_id }, 'recording reconcile query failed');
    }
  }

  // 3) `stopping` dont tous les segments sont déjà clos mais dont le recollage n'a jamais
  //    démarré (webhook traité pendant que le process redémarrait, par ex.) → on relance.
  const stuckStopping = await db.StreamRecording.findAll({ where: { status: 'stopping' }, limit: 50 });
  let concatRetried = 0;
  for (const r of stuckStopping) {
    const segs = r.segments || [];
    if (segs.length > 0 && segs.every((s) => s.status === 'completed' || s.status === 'failed')) {
      await concatenateSession(r.id).catch((err) => logger.warn({ err: err?.message, id: r.id }, 'reconcile: concat retry failed'));
      concatRetried += 1;
    }
  }

  return { pendingFailed: stalePending.length, finalized, failed, concatRetried };
}

/**
 * Vérifie que le caller a le droit de piloter l'enregistrement d'un événement : propriétaire
 * (hôte/artiste/manager) ou staff. Sinon lève 403.
 * @param {string} sourceType @param {string} sourceId @param {string} userId @param {string[]} roles
 * @returns {Promise<void>}
 */
export async function assertEventOwner(sourceType, sourceId, userId, roles = []) {
  if (roles.includes('admin') || roles.includes('moderator')) return;
  let owner = false;
  if (sourceType === 'live') {
    const l = await db.ArtistLive.findByPk(sourceId, { attributes: ['artist_id'], raw: true });
    owner = l?.artist_id === userId;
  } else if (sourceType === 'concert') {
    const c = await db.ArtistConcert.findByPk(sourceId, { attributes: ['artist_id'], raw: true });
    owner = c?.artist_id === userId;
  } else if (sourceType === 'duel') {
    // Seul le manager pilote l'enregistrement d'un duel (comme pour la compétition) — les
    // artistes n'ont pas ce bouton côté client, l'API doit refuser de la même façon.
    const d = await db.Duel.findByPk(sourceId, { attributes: ['manager_id'], raw: true });
    owner = d?.manager_id === userId;
  } else if (sourceType === 'competition') {
    const c = await db.Competition.findByPk(sourceId, { attributes: ['manager_id'], raw: true });
    owner = c?.manager_id === userId;
  }
  if (!owner) throw ApiError.forbidden('FORBIDDEN');
}

/** Fenêtre pendant laquelle un échec récent est encore signalé par `recordingStatus` (voir plus bas). */
const RECENT_FAILURE_WINDOW_MS = 2 * 60 * 1000;

/**
 * État d'enregistrement d'un événement (pour piloter les boutons hôte + le chrono).
 * @param {string} sourceType @param {string} sourceId
 * @returns {Promise<{ mode: 'off'|'auto'|'manual', active: boolean, paused: boolean,
 *   finalizing: boolean, failed: boolean, error: string|null, accumulatedSeconds: number,
 *   runStartedAt: string|null }>}
 */
export async function recordingStatus(sourceType, sourceId) {
  const mode = await getRecordingMode(sourceType);
  const rec = await db.StreamRecording.findOne({
    where: { source_type: sourceType, source_id: sourceId },
    order: [['created_at', 'DESC']],
  });
  const idle = { mode, active: false, paused: false, finalizing: false, failed: false, error: null, accumulatedSeconds: 0, runStartedAt: null };
  if (!rec) return idle;
  if (!OPEN_STATUSES.includes(rec.status)) {
    // Terminal (completed/cancelled/failed) : rien à piloter — SAUF un échec RÉCENT, à
    // remonter explicitement une fois pour que le client affiche une vraie erreur au lieu de
    // revenir silencieusement à l'état inactif après un « Finalisation… » qui semblait bloqué
    // (voir concatenateSession / startEgressSegment — un segment qui échoue à l'allumage du
    // Chrome headless de l'egress, ou une session sans aucun segment récupérable, finit ici).
    if (rec.status === 'failed' && rec.ended_at && Date.now() - new Date(rec.ended_at).getTime() < RECENT_FAILURE_WINDOW_MS) {
      return { ...idle, failed: true, error: rec.error || null };
    }
    return idle;
  }
  return {
    mode,
    active: rec.status === 'active',
    paused: rec.status === 'paused',
    failed: false,
    error: null,
    // Sauvegarde en cours (dernier segment en cours de clôture / recollage ffmpeg) — le client
    // peut afficher un indicateur « finalisation… » pendant ce court laps.
    finalizing: rec.status === 'stopping' || rec.status === 'concatenating',
    accumulatedSeconds: rec.accumulated_seconds,
    runStartedAt: rec.run_started_at,
  };
}

export default {
  startRecording,
  pauseRecording,
  resumeRecording,
  cancelRecording,
  stopRecording,
  concatenateSession,
  finalizeFromEgress,
  reconcileRecordings,
  getRecordingMode,
  assertEventOwner,
  recordingStatus,
  getLiveRecordingGuests,
};
