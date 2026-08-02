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
import { db } from '../models/index.js';
import { roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { createReplay } from './replay.service.js';

/**
 * @file Server-side live recording via **LiveKit Egress** → R2/S3, for replays.
 *
 * On go-live we start a `RoomCompositeEgress` that records the whole room
 * (composited, all publishers) to a deterministic object key. On go-offline we
 * stop it. LiveKit then POSTs an `egress_ended` webhook, which
 * {@link finalizeFromEgress} turns into a `replay_videos` row.
 *
 * The whole module is **best-effort and gated**: if `LIVEKIT_EGRESS_ENABLED` is
 * false or storage/LiveKit is not configured, every entry point is a no-op — a
 * recording failure must never break a go-live. This works identically whether
 * the host publishes from web or mobile (the server records the room, not a
 * client tab).
 *
 * @module services/recording.service
 */

/** Types d'événement enregistrables → room LiveKit. */
const RECORDABLE = new Set(['duel', 'concert', 'competition', 'live']);

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

/**
 * Démarre l'enregistrement d'un direct (idempotent par source). No-op si egress off,
 * si le mode admin l'interdit, ou si le déclencheur n'est pas autorisé par ce mode.
 * @param {object} p
 * @param {'duel'|'concert'|'competition'|'live'} p.sourceType
 * @param {string} p.sourceId
 * @param {string} [p.artistId]
 * @param {string} [p.createdBy]
 * @param {Array<'auto'|'manual'>} [p.allowedModes=['auto']] - Modes sous lesquels ce
 *   déclencheur a le droit de lancer (go-live: `['auto']` ; bouton hôte: `['auto','manual']`).
 * @returns {Promise<void>}
 */
export async function startRecording({ sourceType, sourceId, artistId, createdBy, allowedModes = ['auto'] }) {
  if (!RECORDABLE.has(sourceType) || !sourceId) return;
  if (!egressReady()) return;
  // Gate admin : le mode configuré doit autoriser ce déclencheur.
  const mode = await getRecordingMode(sourceType);
  if (!allowedModes.includes(mode)) return;
  try {
    // Idempotence : ne pas relancer si un enregistrement est déjà en cours pour cette source.
    const existing = await db.StreamRecording.findOne({
      where: { source_type: sourceType, source_id: sourceId, status: ['pending', 'active'] },
    });
    if (existing) return;

    const room = roomName(sourceType, sourceId);
    // Clé déterministe → l'URL publique est connue sans parser le webhook.
    const filePath = `replays/${sourceType}/${sourceId}/${Date.now()}.mp4`;

    const rec = await db.StreamRecording.create({
      room_name: room,
      source_type: sourceType,
      source_id: sourceId,
      artist_id: artistId ?? null,
      created_by: createdBy ?? artistId ?? null,
      file_path: filePath,
      status: 'pending',
    });

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

    const info = await getEgressClient().startRoomCompositeEgress(
      room,
      { file: fileOutput, images: imageOutput },
      { layout: 'grid' },
    );

    rec.egress_id = info?.egressId ?? null;
    rec.status = 'active';
    rec.started_at = new Date();
    await rec.save();
    logger.info({ egressId: rec.egress_id, room, sourceType, sourceId }, 'egress started');
  } catch (err) {
    logger.warn({ err: err?.message, sourceType, sourceId }, 'egress start failed');
    // Marque la ligne en échec sans jamais faire échouer le passage en live.
    await db.StreamRecording.update(
      { status: 'failed', error: String(err?.message || err).slice(0, 500) },
      { where: { source_type: sourceType, source_id: sourceId, status: 'pending' } },
    ).catch(() => {});
  }
}

/**
 * Arrête l'enregistrement en cours d'un direct. No-op si egress off / rien en cours.
 * @param {{ sourceType: string, sourceId: string }} p
 * @returns {Promise<void>}
 */
export async function stopRecording({ sourceType, sourceId }) {
  if (!egressReady()) return;
  try {
    const rec = await db.StreamRecording.findOne({
      where: { source_type: sourceType, source_id: sourceId, status: ['pending', 'active'] },
      order: [['created_at', 'DESC']],
    });
    if (!rec?.egress_id) return;
    // Marque « stopping » immédiatement : libère l'idempotence pour un nouveau slot (compétition)
    // pendant que le webhook egress_ended finalise l'enregistrement précédent.
    rec.status = 'stopping';
    await rec.save().catch(() => {});
    await getEgressClient().stopEgress(rec.egress_id);
    logger.info({ egressId: rec.egress_id, sourceType, sourceId }, 'egress stop requested');
    // Le statut final (completed) + le replay sont posés par le webhook egress_ended.
  } catch (err) {
    logger.warn({ err: err?.message, sourceType, sourceId }, 'egress stop failed');
  }
}

/**
 * Finalise un enregistrement à partir d'un `EgressInfo` reçu par webhook (egress_ended) :
 * crée le `replay_videos` et clôt la ligne `stream_recordings`. Idempotent.
 * @param {object} egressInfo - `EgressInfo` LiveKit.
 * @returns {Promise<void>}
 */
export async function finalizeFromEgress(egressInfo) {
  const egressId = egressInfo?.egressId;
  if (!egressId) return;
  const rec = await db.StreamRecording.findOne({ where: { egress_id: egressId } });
  if (!rec || rec.status === 'completed') return; // inconnu ou déjà finalisé (idempotent)

  try {
    // Durée : les fileResults LiveKit sont en nanosecondes.
    const file = (egressInfo.fileResults || egressInfo.file || [])[0] || {};
    const durationNs = Number(file.duration || egressInfo.duration || 0);
    const durationSec = durationNs > 0 ? Math.round(durationNs / 1e9) : 0;

    const replay = await createReplay(rec.created_by || rec.artist_id, {
      sourceType: rec.source_type,
      eventId: rec.source_id,
      artistId: rec.artist_id || rec.created_by,
      title: await recordingTitle(rec),
      videoUrl: publicUrl(rec.file_path),
      thumbnailUrl: thumbnailFromEgress(egressInfo) || (await eventCover(rec.source_type, rec.source_id)),
      duration: String(durationSec),
      isPublic: true,
      recordedDate: rec.started_at || new Date(),
    });

    rec.status = 'completed';
    rec.replay_id = replay.id;
    rec.ended_at = new Date();
    await rec.save();
    logger.info({ egressId, replayId: replay.id, sourceType: rec.source_type }, 'replay created from egress');
  } catch (err) {
    logger.error({ err: err?.message, egressId }, 'failed to finalize replay from egress');
    await db.StreamRecording.update(
      { status: 'failed', error: String(err?.message || err).slice(0, 500), ended_at: new Date() },
      { where: { egress_id: egressId } },
    ).catch(() => {});
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
 * perdu (crash hôte, redémarrage, webhook manqué). Marque en échec les `pending` bloqués et
 * interroge l'egress réel pour les `active` afin de les finaliser ou clôturer. No-op si off.
 * @returns {Promise<{ pendingFailed: number, finalized: number, failed: number }>}
 */
export async function reconcileRecordings() {
  if (!egressReady()) return { pendingFailed: 0, finalized: 0, failed: 0 };
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

  // 2) `active`/`stopping` : on interroge l'egress réel (webhook potentiellement perdu).
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
        r.status = 'failed';
        r.error = info.error || 'egress failed (reconcile)';
        r.ended_at = new Date();
        await r.save().catch(() => {});
        failed += 1;
      }
      // Sinon toujours en cours → on repassera au prochain tick.
    } catch (err) {
      logger.warn({ err: err?.message, egressId: r.egress_id }, 'recording reconcile query failed');
    }
  }
  return { pendingFailed: stalePending.length, finalized, failed };
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
    const d = await db.Duel.findByPk(sourceId, { attributes: ['artist1_id', 'artist2_id', 'manager_id'], raw: true });
    owner = !!d && [d.artist1_id, d.artist2_id, d.manager_id].includes(userId);
  } else if (sourceType === 'competition') {
    const c = await db.Competition.findByPk(sourceId, { attributes: ['manager_id'], raw: true });
    owner = c?.manager_id === userId;
  }
  if (!owner) throw ApiError.forbidden('FORBIDDEN');
}

/**
 * État d'enregistrement d'un événement (pour piloter le bouton hôte).
 * @param {string} sourceType @param {string} sourceId
 * @returns {Promise<{ mode: 'off'|'auto'|'manual', active: boolean }>}
 */
export async function recordingStatus(sourceType, sourceId) {
  const mode = await getRecordingMode(sourceType);
  const active = await db.StreamRecording.findOne({
    where: { source_type: sourceType, source_id: sourceId, status: ['pending', 'active', 'stopping'] },
  });
  return { mode, active: !!active };
}

export default {
  startRecording,
  stopRecording,
  finalizeFromEgress,
  reconcileRecordings,
  getRecordingMode,
  assertEventOwner,
  recordingStatus,
};
