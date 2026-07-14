import { Op, QueryTypes } from 'sequelize';

import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { callProcedure } from '../utils/procedures.js';
import { sanitizeText } from '../utils/sanitize.js';

/**
 * @file Sponsors domain service.
 *
 * Three concerns:
 *  - **Price tiers** (`sponsor_price_tiers`) — duration→credits pricing grid.
 *  - **Requests** (`sponsor_requests`) — a user pays credits (atomic
 *    `pay_sponsor_from_wallet`) to sponsor an event before its
 *    `sponsor_submission_deadline`; admins approve/reject.
 *  - **Live ad broadcast** (`sponsor_ad_videos` / `sponsor_ad_plays`) — a
 *    host/manager triggers a sponsor spot; every viewer sees it (Socket.IO
 *    `sponsor:ad` start), and stopping stops it for everyone.
 *
 * @module services/sponsor.service
 */

/** Event type → model + deadline column, for request validation. */
const EVENT_MODELS = {
  duel: { model: 'Duel', deadline: 'sponsor_submission_deadline' },
  concert: { model: 'Concert', deadline: 'sponsor_submission_deadline' },
  artist_concert: { model: 'ArtistConcert', deadline: 'sponsor_submission_deadline' },
  competition: { model: 'Competition', deadline: 'sponsor_submission_deadline' },
};

const AD_ROOM_TYPES = new Set(['duel', 'concert', 'competition', 'live']);

/* -------------------------------------------------------------------------- */
/* Price tiers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Lists price tiers ordered by min duration.
 * @param {boolean} [activeOnly=true]
 * @returns {Promise<object[]>}
 */
export async function listTiers(activeOnly = true) {
  const where = activeOnly ? { is_active: true } : {};
  return db.SponsorPriceTier.findAll({ where, order: [['min_seconds', 'ASC']], raw: true });
}

/**
 * Resolves the price (credits) for a media duration from the active grid.
 * @param {number} seconds
 * @returns {Promise<{ tier: object|null, priceCredits: number }>}
 * @throws {ApiError} 400 when no tier covers the duration.
 */
export async function priceForDuration(seconds) {
  const tier = await db.SponsorPriceTier.findOne({
    where: { is_active: true, min_seconds: { [Op.lte]: seconds }, max_seconds: { [Op.gte]: seconds } },
    raw: true,
  });
  if (!tier) throw ApiError.badRequest('SPONSOR_NO_TIER', { details: { seconds } });
  return { tier, priceCredits: Number(tier.price_credits) };
}

/** Creates a tier (admin). @param {object} input @returns {Promise<object>} */
export async function createTier(input) {
  return db.SponsorPriceTier.create({
    label: input.label,
    min_seconds: input.min_seconds,
    max_seconds: input.max_seconds,
    price_credits: input.price_credits,
    is_active: input.is_active ?? true,
  });
}

/** Updates a tier (admin, whitelisted). @throws {ApiError} 404 */
export async function updateTier(id, patch) {
  const tier = await db.SponsorPriceTier.findByPk(id);
  if (!tier) throw ApiError.notFound('NOT_FOUND');
  for (const k of ['label', 'min_seconds', 'max_seconds', 'price_credits', 'is_active']) {
    if (patch[k] !== undefined) tier[k] = patch[k];
  }
  await tier.save();
  return tier;
}

/** Deletes a tier (admin). @returns {Promise<{ removed: boolean }>} */
export async function deleteTier(id) {
  const deleted = await db.SponsorPriceTier.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Creates a sponsor request for an event (unpaid, pending). Validates the event
 * exists and its submission deadline (if any) has not passed, and prices the
 * request from the tier grid by media duration.
 *
 * @param {string} requesterId
 * @param {object} input - `{ eventType, eventId, mediaType, mediaUrl, mediaDurationSeconds, description? }`
 * @returns {Promise<object>} The created request (with `price_credits`).
 * @throws {ApiError} 400 unknown event type · 404 event · 409 deadline passed.
 */
export async function createRequest(requesterId, input) {
  const def = EVENT_MODELS[input.eventType];
  if (!def) throw ApiError.badRequest('VALIDATION_ERROR', { details: { eventType: input.eventType } });

  const event = await db[def.model].findByPk(input.eventId, { raw: true });
  if (!event) throw ApiError.notFound('EVENT_NOT_FOUND');
  const deadline = event[def.deadline];
  if (deadline && new Date(deadline) < new Date()) {
    throw ApiError.conflict('SPONSOR_DEADLINE_PASSED', { details: { deadline } });
  }

  const { priceCredits } = await priceForDuration(input.mediaDurationSeconds);

  return db.SponsorRequest.create({
    requester_id: requesterId,
    event_id: input.eventId,
    event_type: input.eventType,
    media_type: input.mediaType,
    media_url: input.mediaUrl,
    media_duration_seconds: input.mediaDurationSeconds,
    description: sanitizeText(input.description ?? ''), // column is NOT NULL, XSS-sanitized
    price_credits: priceCredits,
    status: 'pending',
  });
}

/**
 * Pays for a pending sponsor request via the atomic wallet procedure
 * (idempotent). Sets `paid_at` on success.
 *
 * @param {string} userId
 * @param {string} requestId
 * @returns {Promise<{ paid: boolean, code: string }>}
 * @throws {ApiError} mapped from the procedure's machine code.
 */
export async function payRequest(userId, requestId) {
  const out = await callProcedure('pay_sponsor_from_wallet', [userId, requestId], ['success', 'code']);
  if (!out.success) {
    if (out.code === 'insufficient_balance') throw ApiError.badRequest('WALLET_INSUFFICIENT');
    if (out.code === 'request_not_found') throw ApiError.notFound('NOT_FOUND');
    if (out.code === 'forbidden') throw ApiError.forbidden('FORBIDDEN');
    throw ApiError.badRequest('SPONSOR_PAYMENT_FAILED', { details: { code: out.code } });
  }
  return { paid: true, code: out.code };
}

/**
 * Lists sponsor requests for the admin queue (paginated).
 * @param {object} query - `status?`, `eventType?` + pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listRequests(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  if (query.eventType) where.event_type = query.eventType;
  const rows = await db.SponsorRequest.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Lists the caller's own sponsor requests (newest first).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listMyRequests(userId) {
  return db.SponsorRequest.findAll({ where: { requester_id: userId }, order: [['created_at', 'DESC']], raw: true });
}

/**
 * Reviews a sponsor request (admin). Approving stamps `approved_at`, registers a
 * playable `sponsor_ad_videos` entry, and notifies the requester; rejecting
 * records `rejected_reason` and notifies. Paid-then-rejected refunds are handled
 * out-of-band by an admin (documented in DECISIONS).
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.reviewerId
 * @param {'approved'|'rejected'} params.status
 * @param {string} [params.rejectedReason]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the request does not exist.
 */
export async function reviewRequest({ id, reviewerId, status, rejectedReason }) {
  const request = await db.SponsorRequest.findByPk(id);
  if (!request) throw ApiError.notFound('NOT_FOUND');

  request.status = status;
  request.reviewed_by = reviewerId;
  if (status === 'approved') {
    request.approved_at = new Date();
    await request.save();
    await db.SponsorAdVideo.create({
      event_id: request.event_id,
      event_type: request.event_type,
      title: request.description || 'Sponsor',
      video_url: request.media_url,
      duration_seconds: request.media_duration_seconds,
      uploaded_by: request.requester_id,
      source_request_ids: request.id, // STRING column: store the originating request id

      is_active: true,
      play_count: 0,
    });
    await notifyUser({
      userId: request.requester_id,
      type: 'sponsor',
      title: 'Sponsoring approuvé',
      message: 'Votre demande de sponsoring a été approuvée.',
      data: { request_id: request.id },
      email: true,
    }).catch(() => {});
  } else {
    request.rejected_reason = rejectedReason ?? null;
    await request.save();
    await notifyUser({
      userId: request.requester_id,
      type: 'sponsor',
      title: 'Sponsoring refusé',
      message: rejectedReason ? `Votre demande a été refusée : ${rejectedReason}` : 'Votre demande a été refusée.',
      data: { request_id: request.id },
      email: true,
    }).catch(() => {});
  }
  return request;
}

/**
 * Event types whose model carries a `sponsor_submission_deadline` column.
 * All four event types are supported — `artist_concert` gained the column via
 * migration 0004.
 */
const DEADLINE_MODELS = {
  duel: 'Duel',
  concert: 'Concert',
  artist_concert: 'ArtistConcert',
  competition: 'Competition',
};

/**
 * Sets (or clears) an event's sponsor submission deadline (admin).
 * @param {object} params
 * @param {'duel'|'concert'|'artist_concert'|'competition'} params.eventType
 * @param {string} params.eventId
 * @param {string|Date|null} params.deadline
 * @returns {Promise<{ eventType: string, eventId: string, sponsor_submission_deadline: Date|null }>}
 * @throws {ApiError} 400 unsupported event type (no deadline column) · 404 event.
 */
export async function setSubmissionDeadline({ eventType, eventId, deadline }) {
  const modelName = DEADLINE_MODELS[eventType];
  if (!modelName) {
    throw ApiError.badRequest('VALIDATION_ERROR', { details: { eventType, reason: 'no_deadline_column' } });
  }
  const row = await db[modelName].findByPk(eventId);
  if (!row) throw ApiError.notFound('EVENT_NOT_FOUND');
  row.sponsor_submission_deadline = deadline ?? null;
  // Concert/Competition carry a NOT NULL updated_at (timestamps:false → set manually).
  if (db[modelName].getAttributes().updated_at) row.updated_at = new Date();
  await row.save();
  return { eventType, eventId, sponsor_submission_deadline: row.sponsor_submission_deadline };
}

/* -------------------------------------------------------------------------- */
/* Live ad broadcast                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Lists the active ad videos available for an event.
 * @param {string} eventId
 * @param {string} eventType
 * @returns {Promise<object[]>}
 */
export async function listAdVideos(eventId, eventType) {
  return db.SponsorAdVideo.findAll({
    where: { event_id: eventId, event_type: eventType, is_active: true },
    order: [['created_at', 'DESC']],
    raw: true,
  });
}

/**
 * Lists ALL ad videos platform-wide (admin), including inactive ones, newest
 * first (limit 500).
 * @returns {Promise<object[]>}
 */
export async function listAllAdVideos() {
  return db.SponsorAdVideo.findAll({ order: [['created_at', 'DESC']], limit: 500, raw: true });
}

/**
 * Creates an ad video directly (admin).
 * @param {object} input - `{ eventId, eventType, title, videoUrl, durationSeconds?, isActive?, uploadedBy? }`
 * @returns {Promise<object>}
 */
export async function createAdVideo(input) {
  return db.SponsorAdVideo.create({
    event_id: input.eventId,
    event_type: input.eventType,
    title: input.title,
    video_url: input.videoUrl,
    duration_seconds: input.durationSeconds ?? 0,
    uploaded_by: input.uploadedBy ?? null,
    is_active: input.isActive ?? true,
    play_count: 0,
  });
}

/**
 * Updates an ad video (admin, whitelisted columns — e.g. toggle `is_active`).
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404.
 */
export async function updateAdVideo(id, patch) {
  const ad = await db.SponsorAdVideo.findByPk(id);
  if (!ad) throw ApiError.notFound('NOT_FOUND');
  for (const k of ['title', 'video_url', 'duration_seconds', 'is_active', 'event_id', 'event_type']) {
    if (patch[k] !== undefined) ad[k] = patch[k];
  }
  await ad.save();
  return ad;
}

/**
 * Starts a sponsor ad broadcast: records a `sponsor_ad_plays` row, bumps the
 * ad's `play_count`, and emits `sponsor:ad` (start) to every viewer in the room.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {'duel'|'concert'|'competition'|'live'} params.eventType
 * @param {string} params.adVideoId
 * @param {string} params.triggeredBy
 * @returns {Promise<object>} The created play row.
 * @throws {ApiError} 404 when the ad video is missing.
 */
export async function startAd({ eventId, eventType, adVideoId, triggeredBy }) {
  const ad = await db.SponsorAdVideo.findByPk(adVideoId, { raw: true });
  if (!ad) throw ApiError.notFound('AD_NOT_FOUND');

  const play = await db.SponsorAdPlay.create({
    ad_video_id: adVideoId,
    event_id: eventId,
    event_type: eventType,
    triggered_by: triggeredBy,
    duration_seconds: ad.duration_seconds,
    played_at: new Date(),
  });
  await db.SponsorAdVideo.increment('play_count', { where: { id: adVideoId } });

  if (AD_ROOM_TYPES.has(eventType)) {
    emitToRoom('/live', roomName(eventType, eventId), 'sponsor:ad', {
      action: 'start',
      play_id: play.id,
      ad: { id: ad.id, video_url: ad.video_url, title: ad.title, duration_seconds: ad.duration_seconds },
    });
  }
  return play;
}

/**
 * Stops an in-progress ad broadcast: stamps `ended_at` and emits `sponsor:ad`
 * (stop) so every viewer's overlay closes simultaneously.
 *
 * @param {string} playId
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the play does not exist.
 */
export async function stopAd(playId) {
  const play = await db.SponsorAdPlay.findByPk(playId);
  if (!play) throw ApiError.notFound('NOT_FOUND');
  if (!play.ended_at) {
    play.ended_at = new Date();
    await play.save();
  }
  if (AD_ROOM_TYPES.has(play.event_type)) {
    emitToRoom('/live', roomName(play.event_type, play.event_id), 'sponsor:ad', {
      action: 'stop',
      play_id: play.id,
    });
  }
  return play;
}

/**
 * Returns the default price for a media duration from the active grid, or
 * `null` if no tier matches (lenient variant of {@link priceForDuration};
 * mirrors `get_sponsor_default_price`).
 * @param {number} seconds
 * @returns {Promise<{ priceCredits: number|null }>}
 */
export async function defaultPrice(seconds) {
  const tier = await db.SponsorPriceTier.findOne({
    where: { is_active: true, min_seconds: { [Op.lte]: seconds }, max_seconds: { [Op.gte]: seconds } },
    order: [['min_seconds', 'ASC']],
    raw: true,
  });
  return { priceCredits: tier ? Number(tier.price_credits) : null };
}

/**
 * Admin sets/overrides a request's price and moves it to `awaiting_payment`,
 * notifying the requester (mirrors `admin_set_sponsor_price`).
 * @param {object} params
 * @param {string} params.id
 * @param {number} params.priceCredits
 * @param {string} params.adminId
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 409 wrong status · 400 invalid price.
 */
export async function setRequestPrice({ id, priceCredits, adminId }) {
  if (!(priceCredits > 0)) throw ApiError.badRequest('AMOUNT_INVALID');
  const request = await db.SponsorRequest.findByPk(id);
  if (!request) throw ApiError.notFound('NOT_FOUND');
  if (!['pending', 'awaiting_payment'].includes(request.status)) throw ApiError.conflict('CONFLICT');
  request.status = 'awaiting_payment';
  request.price_credits = priceCredits;
  request.reviewed_by = adminId;
  await request.save();
  await notifyUser({
    userId: request.requester_id,
    type: 'sponsor_payment_due',
    title: 'Sponsoring approuvé — paiement requis',
    message: `Veuillez payer ${priceCredits} crédits pour finaliser votre sponsoring.`,
    data: { request_id: id, price: priceCredits },
    email: true,
  }).catch(() => {});
  return request;
}

/**
 * Approves a request by reusing an existing media (URL) instead of the
 * requester's upload, registering a playable ad video (mirrors
 * `admin_approve_sponsor_reuse_media`).
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.mediaUrl
 * @param {number} params.durationSeconds
 * @param {string} params.adminId
 * @returns {Promise<object>}
 * @throws {ApiError} 404.
 */
export async function approveReuseMedia({ id, mediaUrl, durationSeconds, adminId }) {
  const request = await db.SponsorRequest.findByPk(id);
  if (!request) throw ApiError.notFound('NOT_FOUND');
  request.status = 'approved';
  request.reviewed_by = adminId;
  request.approved_at = new Date();
  request.media_url = mediaUrl;
  request.media_duration_seconds = durationSeconds;
  await request.save();
  await db.SponsorAdVideo.create({
    event_id: request.event_id,
    event_type: request.event_type,
    title: request.description || 'Sponsor',
    video_url: mediaUrl,
    duration_seconds: durationSeconds,
    uploaded_by: request.requester_id,
    source_request_ids: request.id,
    is_active: true,
    play_count: 0,
  });
  await notifyUser({
    userId: request.requester_id,
    type: 'sponsor',
    title: 'Sponsoring approuvé',
    message: 'Votre demande de sponsoring a été approuvée (média réutilisé).',
    data: { request_id: id },
    email: true,
  }).catch(() => {});
  return request;
}

/**
 * Returns the ad-play history for an event (mirrors `get_sponsor_ad_history`).
 * @param {string} eventId
 * @param {string} eventType
 * @returns {Promise<object[]>}
 */
export async function listAdHistory(eventId, eventType) {
  return db.sequelize.query(
    `SELECT p.id AS play_id, p.ad_video_id, v.title AS ad_title,
            p.triggered_by, COALESCE(pr.full_name, 'Utilisateur') AS triggered_by_name,
            p.played_at, p.ended_at, p.duration_seconds, p.sponsor_paid_credits, p.request_id
       FROM sponsor_ad_plays p
       LEFT JOIN sponsor_ad_videos v ON v.id = p.ad_video_id
       LEFT JOIN profiles pr ON pr.id = p.triggered_by
      WHERE p.event_type = :et AND p.event_id = :eid
      ORDER BY p.played_at DESC`,
    { replacements: { et: eventType, eid: eventId }, type: QueryTypes.SELECT },
  );
}

export default {
  listTiers,
  priceForDuration,
  defaultPrice,
  createTier,
  updateTier,
  deleteTier,
  createRequest,
  payRequest,
  listRequests,
  listMyRequests,
  reviewRequest,
  setRequestPrice,
  approveReuseMedia,
  listAdVideos,
  listAllAdVideos,
  createAdVideo,
  updateAdVideo,
  listAdHistory,
  setSubmissionDeadline,
  startAd,
  stopAd,
};
