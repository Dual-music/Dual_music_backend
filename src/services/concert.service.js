import { Op } from 'sequelize';

import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { callProcedure } from '../utils/procedures.js';
import { sanitizeText } from '../utils/sanitize.js';

import { getDisplayProfiles } from './user.service.js';
import { startRecording, stopRecording } from './recording.service.js';

/** Reads the dedication config section (concert vs live) from economic_config. */
async function dedicationConfig(concertType) {
  const row = await db.PlatformSetting.findByPk('economic_config');
  const v = row?.value ?? {};
  const section = concertType === 'artist_live' ? v.dedication_live ?? v.dedication ?? {} : v.dedication ?? {};
  return {
    minPrice: Number(section.min_price_credits ?? 10) || 10,
    platformPct: Number(section.platform_pct ?? 20) || 20,
  };
}

/**
 * Resolves the artist to credit + whether dedications are allowed for an event, + an optional
 * per-event minimum-price override (lives only, for now — falls back to the global default
 * from {@link dedicationConfig} when absent/null).
 * @param {string} concertType - 'artist_concert' | 'artist_live'.
 * @param {string} concertId
 * @returns {Promise<{ artistId: string, minPriceOverride: number|null }>}
 * @throws {ApiError} 400 unsupported · 404 not found · 409 disabled.
 */
async function resolveDedicationArtist(concertType, concertId) {
  if (concertType === 'artist_concert') {
    const concert = await db.ArtistConcert.findByPk(concertId, {
      attributes: ['artist_id', 'allows_dedications', 'dedication_submission_deadline', 'status'],
      raw: true,
    });
    if (!concert) throw ApiError.notFound('EVENT_NOT_FOUND');
    // `raw` boolean comes back as 0/1 (SQLite and mysql2), so compare truthiness.
    if (!concert.allows_dedications) throw ApiError.conflict('DEDICATIONS_DISABLED');
    // Contrairement au LIVE (dédicaces possibles pendant la diffusion), un CONCERT exige que
    // toutes les demandes soient traitées AVANT le début du direct — imposé serveur, pas
    // seulement via la date limite (qui reste une coupure optionnelle plus précoce).
    if (concert.status !== 'upcoming') {
      throw ApiError.conflict('DEDICATIONS_CLOSED_LIVE', { details: { status: concert.status } });
    }
    const deadline = concert.dedication_submission_deadline;
    if (deadline && new Date(deadline) < new Date()) {
      throw ApiError.conflict('DEDICATION_DEADLINE_PASSED', { details: { deadline } });
    }
    return { artistId: concert.artist_id, minPriceOverride: null };
  }
  if (concertType === 'artist_live') {
    const live = await db.ArtistLive.findByPk(concertId, {
      attributes: ['artist_id', 'allows_dedications', 'dedication_min_price_credits'],
      raw: true,
    });
    if (!live) throw ApiError.notFound('EVENT_NOT_FOUND');
    if (!live.allows_dedications) throw ApiError.conflict('DEDICATIONS_DISABLED');
    const override = live.dedication_min_price_credits;
    return { artistId: live.artist_id, minPriceOverride: override != null ? Number(override) : null };
  }
  throw ApiError.badRequest('VALIDATION_ERROR', { details: { concertType } });
}

/** Nom de room realtime pour un événement de dédicace (`live:<id>` / `concert:<id>`). */
function dedicationRoom(concertType, concertId) {
  return roomName(concertType === 'artist_live' ? 'live' : 'concert', concertId);
}

/**
 * Requests a concert/live dedication: validates + creates a PENDING row. Does
 * **NOT** charge the fan — the debit only happens if/when the artist accepts
 * (see {@link acceptDedication}), so a rejected request never touches a wallet
 * and the fan is never shown a balance that doesn't match what they were
 * actually charged (`purchase_concert_dedication_from_wallet`, now debit-free).
 * @param {string} fanId
 * @param {object} input - `{ concertId, concertType, message, priceCredits }`
 * @returns {Promise<{ dedicationId: string }>}
 * @throws {ApiError} on validation failures.
 */
export async function purchaseDedication(fanId, { concertId, concertType, message, priceCredits }) {
  const clean = sanitizeText(message, { maxLength: 500 });
  if (clean.length < 3) throw ApiError.badRequest('DEDICATION_MESSAGE_REQUIRED');
  if (!(priceCredits > 0)) throw ApiError.badRequest('AMOUNT_INVALID');

  const { minPrice: globalMinPrice, platformPct } = await dedicationConfig(concertType);
  // Vérifie aussi (disabled/introuvable) AVANT le prix : `resolveDedicationArtist` peut fournir
  // une surcharge de prix minimum propre au live, prioritaire sur le défaut global de la plateforme.
  const { artistId, minPriceOverride } = await resolveDedicationArtist(concertType, concertId);
  const minPrice = minPriceOverride ?? globalMinPrice;
  if (priceCredits < minPrice) throw ApiError.badRequest('DEDICATION_PRICE_BELOW_MIN', { details: { min: minPrice } });

  const out = await callProcedure(
    'purchase_concert_dedication_from_wallet',
    [fanId, concertId, concertType, artistId, clean, priceCredits, platformPct],
    ['success', 'code', 'dedication_id'],
  );
  if (!out.success) throw ApiError.badRequest('BAD_REQUEST', { details: { code: out.code } });

  await notifyUser({
    userId: artistId,
    type: 'dedication_received',
    title: 'Nouvelle dédicace',
    message: 'Un fan a demandé une dédicace — accepte ou refuse-la.',
    data: { dedication_id: out.dedication_id, concert_id: concertId, concert_type: concertType },
    email: true,
  }).catch(() => {});
  // Rafraîchit le badge de l'artiste EN DIRECT (pas besoin d'ouvrir le panneau pour le voir).
  emitToRoom('/live', dedicationRoom(concertType, concertId), 'dedication:new', {
    dedication_id: out.dedication_id, concert_id: concertId, concert_type: concertType, artist_id: artistId,
  });
  return { dedicationId: out.dedication_id };
}

/**
 * Accepts a PENDING dedication (artist owner or admin) : charges the fan NOW
 * (atomic debit + artist credit + revenue split, `accept_concert_dedication_from_wallet`),
 * notifies the fan (amount actually charged) and broadcasts so every open client
 * (host's list AND the fan's own balance) refreshes without a page reload.
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} roles
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403 · 409 (not pending) · 400 (insufficient balance).
 */
export async function acceptDedication(id, actorId, roles) {
  const ded = await db.ConcertDedication.findByPk(id);
  if (!ded) throw ApiError.notFound('NOT_FOUND');
  const isOwner = ded.artist_id === actorId;
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!isOwner && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  if (ded.status !== 'pending') throw ApiError.conflict('DEDICATION_NOT_PENDING');

  const { platformPct } = await dedicationConfig(ded.concert_type);
  const out = await callProcedure(
    'accept_concert_dedication_from_wallet',
    [id, platformPct],
    ['success', 'code'],
  );
  if (!out.success) {
    if (out.code === 'insufficient_balance') throw ApiError.badRequest('WALLET_INSUFFICIENT');
    throw ApiError.badRequest('BAD_REQUEST', { details: { code: out.code } });
  }
  await ded.reload();

  await notifyUser({
    userId: ded.fan_id,
    type: 'dedication_accepted',
    title: "Dédicace acceptée par l'artiste !",
    message: `Ta dédicace a été acceptée — ${Number(ded.price_credits)} crédits ont été débités de ton solde. Merci pour ton soutien !`,
    data: { dedication_id: id, concert_id: ded.concert_id, concert_type: ded.concert_type, price_credits: Number(ded.price_credits) },
    email: true,
  }).catch(() => {});
  emitToRoom('/live', dedicationRoom(ded.concert_type, ded.concert_id), 'dedication:update', {
    dedication_id: id, concert_id: ded.concert_id, concert_type: ded.concert_type,
    fan_id: ded.fan_id, status: 'paid', price_credits: Number(ded.price_credits),
  });
  return ded;
}

/**
 * Rejects a PENDING dedication (artist owner or admin) : no wallet touched at
 * all — the fan was never charged. Notifies the fan and broadcasts.
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} roles
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403 · 409 (not pending).
 */
export async function rejectDedication(id, actorId, roles) {
  const ded = await db.ConcertDedication.findByPk(id);
  if (!ded) throw ApiError.notFound('NOT_FOUND');
  const isOwner = ded.artist_id === actorId;
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!isOwner && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  if (ded.status !== 'pending') throw ApiError.conflict('DEDICATION_NOT_PENDING');

  ded.status = 'rejected';
  ded.rejected_at = new Date();
  await ded.save();

  await notifyUser({
    userId: ded.fan_id,
    type: 'dedication_rejected',
    title: "Dédicace refusée",
    message: "L'artiste n'a pas pu donner suite à ta dédicace cette fois-ci. Tu n'as rien été débité.",
    data: { dedication_id: id, concert_id: ded.concert_id, concert_type: ded.concert_type },
    email: true,
  }).catch(() => {});
  emitToRoom('/live', dedicationRoom(ded.concert_type, ded.concert_id), 'dedication:update', {
    dedication_id: id, concert_id: ded.concert_id, concert_type: ded.concert_type,
    fan_id: ded.fan_id, status: 'rejected',
  });
  return ded;
}

/**
 * Marks an ACCEPTED (`paid`) dedication as delivered (artist owner or admin)
 * and notifies the fan. Distinct step from {@link acceptDedication} — the
 * charge already happened at accept time, this just confirms it was performed.
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} roles
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403 · 409 when not in 'paid' state.
 */
export async function deliverDedication(id, actorId, roles) {
  const ded = await db.ConcertDedication.findByPk(id);
  if (!ded) throw ApiError.notFound('NOT_FOUND');
  const isOwner = ded.artist_id === actorId;
  const isStaff = roles.includes('admin') || roles.includes('moderator');
  if (!isOwner && !isStaff) throw ApiError.forbidden('FORBIDDEN');
  if (ded.status !== 'paid') throw ApiError.conflict('DEDICATION_NOT_PENDING');
  ded.status = 'delivered';
  ded.delivered_at = new Date();
  await ded.save();
  await notifyUser({
    userId: ded.fan_id,
    type: 'dedication_delivered',
    title: 'Ta dédicace a été interprétée !',
    message: "L'artiste vient de faire ta dédicace en direct. Merci pour ton soutien !",
    data: { dedication_id: id, concert_id: ded.concert_id, concert_type: ded.concert_type },
    email: true,
  }).catch(() => {});
  emitToRoom('/live', dedicationRoom(ded.concert_type, ded.concert_id), 'dedication:update', {
    dedication_id: id, concert_id: ded.concert_id, concert_type: ded.concert_type,
    fan_id: ded.fan_id, status: 'delivered',
  });
  return ded;
}

/**
 * Lists dedications for an event (artist/host view), newest first.
 * @param {string} concertId
 * @param {string} concertType
 * @returns {Promise<object[]>}
 */
export async function listConcertDedications(concertId, concertType) {
  return db.ConcertDedication.findAll({
    where: { concert_id: concertId, concert_type: concertType },
    order: [['created_at', 'DESC']],
    raw: true,
  });
}

/**
 * Lists the caller's own dedications (fan view).
 * @param {string} fanId
 * @returns {Promise<object[]>}
 */
export async function listMyDedications(fanId) {
  return db.ConcertDedication.findAll({ where: { fan_id: fanId }, order: [['created_at', 'DESC']], raw: true });
}

/**
 * Lists the dedications RECEIVED by an artist (artist inbox), newest first, each
 * enriched with the requesting fan's display profile. Backs the artist
 * dedications manager, which only had event-scoped/fan-scoped reads before.
 * @param {string} artistId
 * @returns {Promise<object[]>}
 */
export async function listArtistDedications(artistId) {
  const rows = await db.ConcertDedication.findAll({
    where: { artist_id: artistId },
    order: [['created_at', 'DESC']],
    raw: true,
  });
  const profiles = await getDisplayProfiles(rows.map((r) => r.fan_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, fan: byId.get(r.fan_id) || null }));
}

/**
 * Resolves artist-concert titles by id list (enrichment for dedication/admin
 * views). Live titles resolve via the lives domain; this covers `artist_concert`
 * references only. De-duplicated and capped at 500 ids.
 * @param {string[]} ids
 * @returns {Promise<Array<{ id: string, title: string }>>}
 */
export async function getArtistConcertTitles(ids) {
  const list = [...new Set((ids ?? []).filter(Boolean))].slice(0, 500);
  if (list.length === 0) return [];
  const { Op } = db.Sequelize;
  return db.ArtistConcert.findAll({
    where: { id: { [Op.in]: list } },
    attributes: ['id', 'title'],
    raw: true,
  });
}

/**
 * @file Concerts domain service.
 *
 * Two concert sources coexist (as in the frontend): admin-programmed `concerts`
 * and artist-created `artist_concerts` (which require admin approval before going
 * public — the `admin_approve_artist_concert` flow). Ticketing is a wallet
 * operation (`purchase_concert_ticket_from_wallet`); this service owns the
 * catalog, creation and approval lifecycle.
 *
 * @module services/concert.service
 */

/**
 * Lists admin-programmed concerts.
 * @param {object} query
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listConcerts(query) {
  const { limit, where, order, mode, offset } = parsePagination(query, { sortColumn: 'scheduled_date', direction: 'DESC' });
  if (query.status) where.status = query.status;
  const rows = await db.Concert.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a single admin concert.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getConcert(id) {
  const concert = await db.Concert.findByPk(id, { raw: true });
  if (!concert) throw ApiError.notFound('NOT_FOUND');
  return concert;
}

/**
 * Returns a single artist concert by id, hydrated with the artist's display
 * profile. Replaces the frontend's dual `artist_concerts`+profile lookup.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function getArtistConcert(id) {
  const concert = await db.ArtistConcert.findByPk(id, { raw: true });
  if (!concert) throw ApiError.notFound('NOT_FOUND');
  const [artist] = await getDisplayProfiles([concert.artist_id]);
  return { ...concert, artist: artist ?? null };
}

/**
 * Creates an admin-programmed concert.
 * @param {Record<string, unknown>} input
 * @returns {Promise<object>}
 */
export async function createConcert(input) {
  return db.Concert.create({
    artist_name: input.artistName,
    title: input.title,
    description: input.description ?? null,
    scheduled_date: input.scheduledDate,
    scheduled_time: input.scheduledTime ?? '',
    location: input.location ?? '',
    ticket_price: input.ticketPrice ?? 0,
    max_tickets: input.maxTickets ?? null,
    image_url: input.imageUrl ?? null,
    status: 'upcoming',
  });
}

/**
 * Updates an admin-programmed concert (admin). Whitelisted to status + replay
 * fields (mirrors the admin concert control surface).
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function updateConcert(id, patch) {
  const concert = await db.Concert.findByPk(id);
  if (!concert) throw ApiError.notFound('NOT_FOUND');
  const map = { status: 'status', recordingUrl: 'recording_url', isReplayAvailable: 'is_replay_available' };
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) concert[col] = patch[key];
  }
  concert.updated_at = new Date();
  await concert.save();
  if ('status' in patch) {
    emitToRoom('/live', roomName('concert', id), 'status', { concert_id: id, status: concert.status });
  }
  return concert;
}

/**
 * Lists artist concerts (defaults to approved ones for the public catalog).
 * @param {object} query - `approvalStatus?`, `artistId?`, pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listArtistConcerts(query) {
  const { limit, where, order, mode, offset } = parsePagination(query, { sortColumn: 'scheduled_date', direction: 'DESC' });
  // approvalStatus may be a single value or a comma list (e.g. "pending,rejected").
  const statuses = String(query.approvalStatus || 'approved').split(',').map((s) => s.trim()).filter(Boolean);
  where.approval_status = statuses.length > 1 ? { [Op.in]: statuses } : statuses[0];
  if (query.artistId) where.artist_id = query.artistId;
  const rows = await db.ArtistConcert.findAll({ where, order, limit, offset, raw: true });
  const profiles = await getDisplayProfiles(rows.map((r) => r.artist_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({ ...r, artist: byId.get(r.artist_id) || null }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Creates an artist concert (pending admin approval).
 * @param {string} artistId
 * @param {Record<string, unknown>} input
 * @returns {Promise<object>}
 */
export async function createArtistConcert(artistId, input) {
  // L'admin peut désactiver l'exigence d'approbation (réglage) → concert publié directement.
  const requireApproval = await concertApprovalRequired();
  const concert = await db.ArtistConcert.create({
    artist_id: artistId,
    title: input.title,
    description: input.description ?? null,
    scheduled_date: input.scheduledDate,
    ticket_price: input.ticketPrice ?? 0,
    max_tickets: input.maxTickets ?? null,
    cover_image_url: input.coverImageUrl ?? null,
    allows_dedications: input.allowsDedications ?? true,
    allows_sponsor_ads: input.allowsSponsorAds ?? true,
    // Dates limites saisies à la création si la case correspondante est cochée (sinon `null` :
    // pas de coupure, cohérent avec le comportement existant des demandes de sponsor).
    sponsor_submission_deadline: input.allowsSponsorAds ? (input.sponsorSubmissionDeadline ?? null) : null,
    dedication_submission_deadline: input.allowsDedications ? (input.dedicationSubmissionDeadline ?? null) : null,
    approval_status: requireApproval ? 'pending' : 'approved',
    status: 'upcoming',
  });
  // Alerte les admins qu'un concert attend validation (in-app + push + email).
  if (concert.approval_status === 'pending') void notifyAdminsConcertPending(concert).catch(() => {});
  return concert;
}

/**
 * L'admin exige-t-il l'approbation des concerts d'artistes ?
 * Réglage `concert_approval_config` = `{ require_admin_approval: boolean }`
 * (écrit par le PlatformConfigManager web). Défaut : oui (approbation requise).
 */
async function concertApprovalRequired() {
  const row = await db.PlatformSetting.findByPk('concert_approval_config', { raw: true }).catch(() => null);
  const v = row?.value;
  if (v && typeof v === 'object' && v.require_admin_approval === false) return false;
  return true;
}

/** Prévient tous les admins qu'un concert attend leur validation. */
async function notifyAdminsConcertPending(concert) {
  const [admins, artist] = await Promise.all([
    db.UserRole.findAll({ where: { role: 'admin' }, attributes: ['user_id'], raw: true }).catch(() => []),
    db.Profile.findByPk(concert.artist_id, { attributes: ['full_name'], raw: true }).catch(() => null),
  ]);
  await Promise.allSettled(
    admins.map((a) =>
      notifyUser({
        userId: a.user_id,
        type: 'concert_approval',
        title: 'Concert à valider',
        message: `${artist?.full_name || 'Un artiste'} a soumis le concert « ${concert.title} » pour validation.`,
        data: { concert_id: concert.id },
        email: true,
        push: true,
      }),
    ),
  );
}

/**
 * Returns the caller's ticket for a concert (or null) plus the total sold count.
 * Replaces the frontend's `.from('concert_tickets')` "my ticket" + count reads.
 * @param {string} concertId
 * @param {string|null} userId
 * @returns {Promise<{ ticket: object|null, count: number }>}
 */
export async function getConcertTicketInfo(concertId, userId) {
  const [ticket, count] = await Promise.all([
    userId
      ? db.ConcertTicket.findOne({ where: { concert_id: concertId, user_id: userId }, raw: true })
      : Promise.resolve(null),
    db.ConcertTicket.count({ where: { concert_id: concertId } }),
  ]);
  return { ticket: ticket ?? null, count };
}

/**
 * Returns whether the caller has a reminder set for a concert.
 * @param {string} concertId
 * @param {string} userId
 * @returns {Promise<{ active: boolean }>}
 */
export async function getMyReminder(concertId, userId) {
  const row = await db.ConcertReminder.findOne({ where: { concert_id: concertId, user_id: userId } });
  return { active: !!row };
}

/**
 * Enables a reminder for the caller on a concert (idempotent).
 * @param {string} concertId
 * @param {string} userId
 * @param {string} [reminderType='30min']
 * @returns {Promise<{ active: boolean }>}
 */
export async function setReminder(concertId, userId, reminderType = '30min') {
  await db.ConcertReminder.findOrCreate({
    where: { concert_id: concertId, user_id: userId },
    defaults: { concert_id: concertId, user_id: userId, reminder_type: reminderType },
  });
  return { active: true };
}

/**
 * Disables the caller's reminder for a concert.
 * @param {string} concertId
 * @param {string} userId
 * @returns {Promise<{ active: boolean }>}
 */
export async function removeReminder(concertId, userId) {
  await db.ConcertReminder.destroy({ where: { concert_id: concertId, user_id: userId } });
  return { active: false };
}

/**
 * Lists the caller's OWN artist concerts across all approval statuses (owner
 * view). Replaces the frontend's `.from('artist_concerts').eq('artist_id', me)`.
 * @param {string} artistId
 * @returns {Promise<object[]>}
 */
export async function listMyArtistConcerts(artistId) {
  return db.ArtistConcert.findAll({
    where: { artist_id: artistId },
    order: [['scheduled_date', 'DESC']],
    raw: true,
  });
}

/** Fields an artist may edit on their own concert. */
const ARTIST_CONCERT_EDITABLE = new Set([
  'title', 'description', 'scheduledDate', 'ticketPrice', 'maxTickets',
  'coverImageUrl', 'allowsDedications', 'allowsSponsorAds', 'status',
  'recordingUrl', 'isReplayAvailable', 'chatEnabled',
  'sponsorSubmissionDeadline', 'dedicationSubmissionDeadline',
]);

/** Keys that don't count as reviewable "content" (no re-approval on change). */
const ARTIST_CONCERT_NON_CONTENT = new Set(['status', 'recordingUrl', 'isReplayAvailable', 'chatEnabled']);

/**
 * Updates an artist concert (owner or admin). Editing content resets an already
 * reviewed concert back to `pending` unless the caller is an admin.
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} roles
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403.
 */
export async function updateArtistConcert(id, actorId, roles, patch) {
  const concert = await db.ArtistConcert.findByPk(id);
  if (!concert) throw ApiError.notFound('NOT_FOUND');
  const isAdmin = roles.includes('admin');
  if (concert.artist_id !== actorId && !isAdmin) throw ApiError.forbidden('FORBIDDEN');

  // Un concert non approuvé ne peut PAS passer en direct (parité : invisible + non lançable).
  if (patch.status === 'live' && concert.approval_status !== 'approved') {
    throw ApiError.badRequest('CONCERT_NOT_APPROVED', { details: { approvalStatus: concert.approval_status } });
  }

  const map = {
    title: 'title', description: 'description', scheduledDate: 'scheduled_date',
    ticketPrice: 'ticket_price', maxTickets: 'max_tickets', coverImageUrl: 'cover_image_url',
    allowsDedications: 'allows_dedications', allowsSponsorAds: 'allows_sponsor_ads', status: 'status',
    recordingUrl: 'recording_url', isReplayAvailable: 'is_replay_available', chatEnabled: 'chat_enabled',
    sponsorSubmissionDeadline: 'sponsor_submission_deadline',
    dedicationSubmissionDeadline: 'dedication_submission_deadline',
  };
  let contentChanged = false;
  for (const [key, col] of Object.entries(map)) {
    if (key in patch && ARTIST_CONCERT_EDITABLE.has(key)) {
      concert[col] = patch[key];
      if (!ARTIST_CONCERT_NON_CONTENT.has(key)) contentChanged = true;
    }
  }
  // A non-admin editing content re-enters the approval queue.
  if (contentChanged && !isAdmin && concert.approval_status === 'approved') {
    concert.approval_status = 'pending';
  }
  await concert.save();
  if ('status' in patch) {
    emitToRoom('/live', roomName('concert', id), 'status', { concert_id: id, status: concert.status });
    // Egress : enregistre le concert du passage en live à la fin (no-op si egress désactivé).
    if (patch.status === 'live') void startRecording({ sourceType: 'concert', sourceId: id, artistId: concert.artist_id, createdBy: concert.artist_id }).catch(() => {});
    if (patch.status === 'ended') void stopRecording({ sourceType: 'concert', sourceId: id }).catch(() => {});
  }
  if ('chatEnabled' in patch) {
    emitToRoom('/live', roomName('concert', id), 'settings', { concert_id: id, chat_enabled: concert.chat_enabled });
  }
  return concert;
}

/**
 * Deletes an artist concert (owner or admin).
 * @param {string} id
 * @param {string} actorId
 * @param {string[]} roles
 * @returns {Promise<void>}
 * @throws {ApiError} 404 · 403.
 */
export async function deleteArtistConcert(id, actorId, roles) {
  const concert = await db.ArtistConcert.findByPk(id);
  if (!concert) throw ApiError.notFound('NOT_FOUND');
  if (concert.artist_id !== actorId && !roles.includes('admin')) throw ApiError.forbidden('FORBIDDEN');
  await concert.destroy();
}

/**
 * Approves or rejects an artist concert (admin). Mirrors
 * `admin_approve_artist_concert`.
 * @param {string} id
 * @param {string} adminId
 * @param {{ approve: boolean, rejectionReason?: string }} decision
 * @returns {Promise<object>}
 */
export async function reviewArtistConcert(id, adminId, decision) {
  const concert = await db.ArtistConcert.findByPk(id);
  if (!concert) throw ApiError.notFound('NOT_FOUND');
  concert.approval_status = decision.approve ? 'approved' : 'rejected';
  concert.approved_by = adminId;
  concert.approved_at = new Date();
  if (!decision.approve) concert.rejection_reason = decision.rejectionReason ?? null;
  await concert.save();

  // Notifie l'artiste (in-app + temps réel + push + email) via le pipeline unique.
  await notifyUser({
    userId: concert.artist_id,
    type: 'concert_approval',
    title: decision.approve ? 'Concert approuvé' : 'Concert refusé',
    message: decision.approve
      ? `Votre concert "${concert.title}" a été approuvé.`
      : `Votre concert "${concert.title}" a été refusé.`,
    data: { concert_id: concert.id },
    email: true,
    push: true,
  });
  return concert;
}

export default {
  listConcerts,
  getConcert,
  createConcert,
  updateConcert,
  listArtistConcerts,
  getArtistConcert,
  listMyArtistConcerts,
  createArtistConcert,
  updateArtistConcert,
  deleteArtistConcert,
  reviewArtistConcert,
  getConcertTicketInfo,
  getMyReminder,
  setReminder,
  removeReminder,
  purchaseDedication,
  acceptDedication,
  rejectDedication,
  deliverDedication,
  listConcertDedications,
  listMyDedications,
  listArtistDedications,
  getArtistConcertTitles,
};
