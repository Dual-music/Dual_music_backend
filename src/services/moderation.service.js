import { QueryTypes } from 'sequelize';

import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { emitToRoom, getRoomSize, getRoomUserIds, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { logger } from '../config/logger.js';

import { logAdminAction } from './adminLog.service.js';
import { getDisplayProfiles } from './user.service.js';
import * as liveService from './live.service.js';
import * as concertService from './concert.service.js';
import * as duelService from './duel.service.js';
import * as competitionService from './competition.service.js';

/**
 * @file Moderation domain service — community safety.
 *
 * Covers three concerns kept deliberately distinct:
 *  - **Reports** (`account_reports`, `live_reports`, `competition_reports`) —
 *    user-submitted signals, reviewed by moderators/admins.
 *  - **Bans** — platform-wide (`profiles.is_banned`) vs per-event
 *    (`stream_bans`, `competition_bans`), never conflated.
 *  - **Warnings** (`account_warnings`) — soft sanctions notified to the user.
 *
 * @module services/moderation.service
 */

/** Report kind → { model, fk (reporter col), targetCol }. */
const REPORT_KINDS = {
  account: { model: 'AccountReport', reporterCol: 'reporter_id', targetCol: 'reported_user_id', targetKey: 'reportedUserId' },
  live: { model: 'LiveReport', reporterCol: 'user_id', targetCol: 'live_id', targetKey: 'liveId' },
  competition: { model: 'CompetitionReport', reporterCol: 'reporter_id', targetCol: 'competition_id', targetKey: 'competitionId' },
};

/**
 * Files a report of the given kind on behalf of a reporter.
 *
 * @param {'account'|'live'|'competition'} kind
 * @param {string} reporterId
 * @param {{ reason: string, details?: string } & Record<string, string>} input
 * @returns {Promise<object>} The created report row.
 * @throws {ApiError} 400 when the target id is missing.
 */
export async function createReport(kind, reporterId, input) {
  const def = REPORT_KINDS[kind];
  if (!def) throw ApiError.badRequest('BAD_REQUEST');
  const targetId = input[def.targetKey];
  if (!targetId) throw ApiError.badRequest('VALIDATION_ERROR', { details: { field: def.targetKey } });

  // `kind === 'live'` is the generic table shared by live/concert/duel — `event_type` (from the
  // client's `streamType`) is what actually tells them apart. `kind === 'competition'` always IS
  // a competition (its own dedicated table), so the event type is the kind itself.
  const eventType = kind === 'live' ? (input.streamType || 'live') : kind;

  const row = await db[def.model].create({
    [def.reporterCol]: reporterId,
    [def.targetCol]: targetId,
    ...(kind === 'live' ? { event_type: eventType } : {}),
    reason: input.reason,
    details: input.details ?? null,
    status: 'pending',
  });

  // Alerte admin + décision automatique éventuelle — best-effort, ne doit jamais faire échouer
  // la réponse au signaleur si une notif ou un comptage échoue.
  void handleNewReport(eventType, targetId, input.reason).catch((err) => {
    logger.warn({ err: err?.message, eventType, targetId }, 'report: post-processing failed');
  });

  return row;
}

/** Libellés d'affichage pour la notification admin. */
const EVENT_TYPE_LABELS = { live: 'un live', concert: 'un concert', duel: 'un duel', competition: 'une compétition' };
/** Chemin web (relatif) vers l'événement, pour le lien dans la notification. */
function eventDeepLink(eventType, eventId) {
  if (eventType === 'live') return `/live/${eventId}`;
  if (eventType === 'concert') return `/concert/${eventId}/live`;
  if (eventType === 'duel') return `/duel/${eventId}`;
  if (eventType === 'competition') return `/competition/${eventId}/live`;
  return '/admin';
}

/**
 * Post-traitement d'un signalement fraîchement créé : alerte tous les admins (in-app + push +
 * email, avec un lien direct vers l'événement) puis vérifie si le seuil de signalements
 * (`live_report_config`) est atteint pour déclencher l'arrêt automatique — CÔTÉ SERVEUR, donc
 * appliqué de façon identique quel que soit le client d'où vient le signalement (web ou mobile),
 * contrairement à l'ancien minuteur purement client (un seul onglet web, jamais sur mobile).
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @param {string} reason
 */
async function handleNewReport(eventType, eventId, reason) {
  const admins = await db.UserRole.findAll({ where: { role: 'admin' }, attributes: ['user_id'], raw: true }).catch(() => []);
  await Promise.allSettled(
    admins.map((a) =>
      notifyUser({
        userId: a.user_id,
        type: 'live_report',
        title: '⚠️ Signalement reçu',
        message: `${EVENT_TYPE_LABELS[eventType] || 'un événement'} a été signalé (motif : ${reason}).`,
        data: { event_type: eventType, event_id: eventId, link: eventDeepLink(eventType, eventId) },
        email: true,
        push: true,
      }),
    ),
  );

  await maybeAutoStop(eventType, eventId);
}

/** Compte les signalements en attente pour CET événement précis (pas tous types confondus). */
async function countPendingReports(eventType, eventId) {
  if (eventType === 'competition') {
    return db.CompetitionReport.count({ where: { competition_id: eventId, status: 'pending' } });
  }
  return db.LiveReport.count({ where: { live_id: eventId, event_type: eventType, status: 'pending' } });
}

/**
 * Arrête automatiquement l'événement une fois le seuil de `live_report_config` atteint (comptage
 * ET décision entièrement serveur — voir {@link handleNewReport}). Réutilise directement les
 * fonctions de mise à jour de statut de chaque domaine (avec `roles: ['admin']`, qu'elles
 * acceptent déjà toutes pour un accès staff) pour garantir EXACTEMENT le même comportement
 * (diffusion Socket.IO, clôture d'enregistrement…) qu'un arrêt manuel par un admin.
 */
async function maybeAutoStop(eventType, eventId) {
  const row = await db.PlatformSetting.findByPk('live_report_config', { raw: true }).catch(() => null);
  const cfg = row?.value || {};
  const enabledKey = `enabled_${eventType}`;
  if (cfg[enabledKey] === false) return;
  const viewerThreshold = Number(cfg.viewer_threshold ?? 5);
  const stopPercentage = Number(cfg.stop_percentage ?? 75);

  const viewerCount = getRoomSize('/live', roomName(eventType, eventId));
  if (viewerCount < viewerThreshold) return;

  const reportCount = await countPendingReports(eventType, eventId);
  const percentage = (reportCount / Math.max(1, viewerCount)) * 100;
  if (percentage < stopPercentage) return;

  const SYSTEM_ACTOR = { id: 'system', email: 'system@dualmusic' };
  try {
    if (eventType === 'live') {
      await liveService.updateLiveStatus(eventId, SYSTEM_ACTOR.id, ['admin'], 'ended');
    } else if (eventType === 'concert') {
      await concertService.updateArtistConcert(eventId, SYSTEM_ACTOR.id, ['admin'], { status: 'ended' });
    } else if (eventType === 'duel') {
      await duelService.updateDuel(eventId, SYSTEM_ACTOR, ['admin'], { status: 'ended' });
    } else if (eventType === 'competition') {
      await competitionService.updateCompetition(eventId, SYSTEM_ACTOR, ['admin'], { status: 'cancelled' });
    }
  } catch (err) {
    // Déjà terminé/annulé, ou introuvable — pas une vraie erreur de modération.
    logger.info({ err: err?.message, eventType, eventId }, 'auto-stop: no-op (already ended or not found)');
  }
}

/**
 * Lists reports of a kind for the moderation queue (paginated, newest first).
 * @param {'account'|'live'|'competition'} kind
 * @param {object} query - `status?` + pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listReports(kind, query) {
  const def = REPORT_KINDS[kind];
  if (!def) throw ApiError.badRequest('BAD_REQUEST');
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  const rows = await db[def.model].findAll({ where, order, limit, offset, raw: true });

  // Hydrate reporter display profiles (no N+1: single batched fetch).
  const reporterIds = rows.map((r) => r[def.reporterCol]).filter(Boolean);
  const profiles = await getDisplayProfiles(reporterIds);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const hydrated = rows.map((r) => ({ ...r, reporter: byId.get(r[def.reporterCol]) || null }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Reviews (resolves/dismisses) a report and stamps the reviewer.
 * @param {'account'|'live'|'competition'} kind
 * @param {string} id
 * @param {string} reviewerId
 * @param {'reviewed'|'resolved'|'dismissed'} status
 * @param {string} [reviewerName]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the report does not exist.
 */
export async function reviewReport(kind, id, reviewerId, status, reviewerName) {
  const def = REPORT_KINDS[kind];
  if (!def) throw ApiError.badRequest('BAD_REQUEST');
  const report = await db[def.model].findByPk(id);
  if (!report) throw ApiError.notFound('NOT_FOUND');
  report.status = status;
  report.reviewed_by = reviewerId;
  report.reviewed_at = new Date();
  await report.save();
  await logAdminAction({
    adminId: reviewerId,
    adminName: reviewerName,
    actionType: 'review_report',
    targetType: `${kind}_report`,
    targetId: id,
    details: { status },
  });
  return report;
}

/**
 * Aggregates account reports per reported user (admin): total + pending counts
 * and the most recent report date, most-reported first (limit 200).
 * @returns {Promise<Array<{ reported_user_id: string, count: number, pending_count: number, last_reported_at: string }>>}
 */
export async function aggregateAccountReports() {
  return db.sequelize.query(
    `SELECT reported_user_id,
            COUNT(*) AS count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
            MAX(created_at) AS last_reported_at
       FROM account_reports
      GROUP BY reported_user_id
      ORDER BY count DESC
      LIMIT 200`,
    { type: QueryTypes.SELECT },
  );
}

/* -------------------------------------------------------------------------- */
/* Event moderation — host + up to 2 appointed viewer-moderators              */
/* -------------------------------------------------------------------------- */

/** Primary host per event type: artist for live/concert, manager for duel/competition. */
const EVENT_HOST_LOOKUP = {
  live: { model: db.ArtistLive, hostField: 'artist_id' },
  concert: { model: db.ArtistConcert, hostField: 'artist_id' },
  duel: { model: db.Duel, hostField: 'manager_id' },
  competition: { model: db.Competition, hostField: 'manager_id' },
};

/**
 * Is `userId` the primary host (artist/manager) of this event? `false` for an
 * unknown event or event type.
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isEventHost(eventType, eventId, userId) {
  const def = EVENT_HOST_LOOKUP[eventType];
  if (!def) return false;
  const row = await def.model.findByPk(eventId, { attributes: [def.hostField], raw: true }).catch(() => null);
  return !!row && row[def.hostField] === userId;
}

/**
 * May `actor` moderate (ban, hide messages) this event? True for the primary
 * host, a platform admin/moderator, or a viewer the host has appointed via
 * {@link appointModerator}. Does NOT grant the chat on/off toggle — that stays
 * host-only (enforced in each domain service's own update function).
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @returns {Promise<boolean>}
 */
export async function canModerateEvent(eventType, eventId, actor, actorRoles) {
  if (actorRoles.includes('admin') || actorRoles.includes('moderator')) return true;
  if (await isEventHost(eventType, eventId, actor.id)) return true;
  const count = await db.EventModerator.count({ where: { event_type: eventType, event_id: eventId, user_id: actor.id } });
  return count > 0;
}

/** Throws FORBIDDEN unless `actor` is this event's primary host (or admin). */
async function assertEventHost(eventType, eventId, actor, actorRoles) {
  if (actorRoles.includes('admin')) return;
  if (!(await isEventHost(eventType, eventId, actor.id))) throw ApiError.forbidden('FORBIDDEN');
}

/** Max viewer-moderators a host may appoint per event. */
const MAX_EVENT_MODERATORS = 2;

/**
 * Lists the users currently connected to an event's room (host only) — the
 * pool the host picks appointed moderators from. Excludes the host themself.
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @returns {Promise<object[]>} Hydrated display profiles.
 * @throws {ApiError} 403 if `actor` isn't the host/admin.
 */
export async function listCurrentViewers(eventType, eventId, actor, actorRoles) {
  await assertEventHost(eventType, eventId, actor, actorRoles);
  const ids = getRoomUserIds('/live', roomName(eventType, eventId)).filter((id) => id !== actor.id);
  return getDisplayProfiles(ids);
}

/**
 * Appoints a viewer as this event's moderator (host only, capped at
 * {@link MAX_EVENT_MODERATORS}). Notifies the appointee and broadcasts so
 * their client immediately unlocks moderation controls (ban button, etc.).
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @param {string} targetUserId
 * @returns {Promise<object>}
 * @throws {ApiError} 403 not host · 400 appointing self · 409 already a moderator / limit reached.
 */
export async function appointModerator(eventType, eventId, actor, actorRoles, targetUserId) {
  await assertEventHost(eventType, eventId, actor, actorRoles);
  if (targetUserId === actor.id) throw ApiError.badRequest('BAD_REQUEST');
  const existing = await db.EventModerator.findAll({ where: { event_type: eventType, event_id: eventId }, raw: true });
  if (existing.some((m) => m.user_id === targetUserId)) throw ApiError.conflict('ALREADY_MODERATOR');
  if (existing.length >= MAX_EVENT_MODERATORS) throw ApiError.conflict('MODERATOR_LIMIT_REACHED');

  const row = await db.EventModerator.create({
    event_type: eventType,
    event_id: eventId,
    user_id: targetUserId,
    appointed_by: actor.id,
  });
  emitToRoom('/live', roomName(eventType, eventId), 'moderator:appointed', {
    event_type: eventType, event_id: eventId, user_id: targetUserId,
  });
  void notifyUser({
    userId: targetUserId,
    type: 'event_moderator',
    title: 'Vous êtes maintenant modérateur',
    message: "L'hôte vous a désigné pour l'aider à modérer ce direct.",
    data: { event_type: eventType, event_id: eventId },
  }).catch(() => {});
  return row;
}

/**
 * Revokes an appointed moderator (host only).
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @param {string} targetUserId
 * @returns {Promise<{ removed: boolean }>}
 * @throws {ApiError} 403 if `actor` isn't the host/admin.
 */
export async function revokeModerator(eventType, eventId, actor, actorRoles, targetUserId) {
  await assertEventHost(eventType, eventId, actor, actorRoles);
  const deleted = await db.EventModerator.destroy({ where: { event_type: eventType, event_id: eventId, user_id: targetUserId } });
  if (deleted > 0) {
    emitToRoom('/live', roomName(eventType, eventId), 'moderator:revoked', {
      event_type: eventType, event_id: eventId, user_id: targetUserId,
    });
  }
  return { removed: deleted > 0 };
}

/**
 * Lists an event's appointed moderators, hydrated with display profiles —
 * public (any viewer may see who else can moderate, e.g. a badge in chat).
 * @param {'live'|'concert'|'duel'|'competition'} eventType
 * @param {string} eventId
 * @returns {Promise<object[]>}
 */
export async function listEventModerators(eventType, eventId) {
  const rows = await db.EventModerator.findAll({ where: { event_type: eventType, event_id: eventId }, raw: true });
  const profiles = await getDisplayProfiles(rows.map((r) => r.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, user: byId.get(r.user_id) || null }));
}

/* -------------------------------------------------------------------------- */
/* Bans — per-event                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Bans a user from a single stream (duel/live/concert/competition). Host,
 * appointed moderator or platform admin/moderator only (see
 * {@link canModerateEvent}) — NOT any artist/manager, contrary to what the
 * route's role gate alone would allow. Broadcasts the ban so the client can
 * force-disconnect the target immediately.
 *
 * @param {object} params
 * @param {string} params.streamId
 * @param {'duel'|'live'|'concert'|'competition'} params.streamType
 * @param {string} params.bannedUserId
 * @param {string} params.bannedBy
 * @param {string} [params.reason]
 * @param {{ id: string }} params.actor
 * @param {string[]} params.actorRoles
 * @returns {Promise<object>}
 * @throws {ApiError} 403 if `actor` may not moderate this event.
 */
export async function banFromStream({ streamId, streamType, bannedUserId, bannedBy, reason, actor, actorRoles }) {
  if (!(await canModerateEvent(streamType, streamId, actor, actorRoles))) throw ApiError.forbidden('FORBIDDEN');
  const ban = await db.StreamBan.create({
    stream_id: streamId,
    stream_type: streamType,
    banned_user_id: bannedUserId,
    banned_by: bannedBy,
    reason: reason ?? null,
  });
  const room = ['duel', 'concert', 'competition', 'live'].includes(streamType)
    ? roomName(streamType, streamId)
    : null;
  if (room) emitToRoom('/live', room, 'stream:banned', { user_id: bannedUserId, stream_id: streamId });
  return ban;
}

/**
 * Lifts a stream ban. Host, appointed moderator or platform admin/moderator
 * of the banned event only (see {@link canModerateEvent}).
 * @param {string} id
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @returns {Promise<{ removed: boolean }>}
 * @throws {ApiError} 403 if `actor` may not moderate this event.
 */
export async function liftStreamBan(id, actor, actorRoles) {
  const ban = await db.StreamBan.findByPk(id, { raw: true });
  if (!ban) return { removed: false };
  if (!(await canModerateEvent(ban.stream_type, ban.stream_id, actor, actorRoles))) throw ApiError.forbidden('FORBIDDEN');
  const deleted = await db.StreamBan.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

/**
 * Lists active stream bans, newest first (limit 200). When `streamId`/`streamType`
 * are provided the list is filtered to that stream; otherwise all bans are returned.
 * @param {string} [streamId]
 * @param {string} [streamType]
 * @returns {Promise<object[]>}
 */
export async function listStreamBans(streamId, streamType) {
  const where = {};
  if (streamId) where.stream_id = streamId;
  if (streamType) where.stream_type = streamType;
  return db.StreamBan.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 200,
    raw: true,
  });
}

/**
 * Lists competition bans, newest first (limit 200), optionally scoped to one
 * competition.
 * @param {string} [competitionId]
 * @returns {Promise<object[]>}
 */
export async function listCompetitionBans(competitionId) {
  const where = {};
  if (competitionId) where.competition_id = competitionId;
  return db.CompetitionBan.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 200,
    raw: true,
  });
}

/**
 * Bans a candidate/viewer from a specific competition. Host (manager),
 * appointed moderator or platform admin/moderator only (see {@link canModerateEvent}).
 * @param {object} params
 * @param {string} params.competitionId
 * @param {string} params.bannedUserId
 * @param {string} params.bannedBy
 * @param {string} [params.reason]
 * @param {{ id: string }} params.actor
 * @param {string[]} params.actorRoles
 * @returns {Promise<object>}
 * @throws {ApiError} 403 if `actor` may not moderate this competition.
 */
export async function banFromCompetition({ competitionId, bannedUserId, bannedBy, reason, actor, actorRoles }) {
  if (!(await canModerateEvent('competition', competitionId, actor, actorRoles))) throw ApiError.forbidden('FORBIDDEN');
  const ban = await db.CompetitionBan.create({
    competition_id: competitionId,
    banned_user_id: bannedUserId,
    banned_by: bannedBy,
    reason: reason ?? null,
  });
  emitToRoom('/live', roomName('competition', competitionId), 'competition:banned', {
    user_id: bannedUserId,
    competition_id: competitionId,
  });
  return ban;
}

/**
 * Lifts a competition ban. Host (manager), appointed moderator or platform
 * admin/moderator of the banned competition only.
 * @param {string} id
 * @param {{ id: string }} actor
 * @param {string[]} actorRoles
 * @returns {Promise<{ removed: boolean }>}
 * @throws {ApiError} 403 if `actor` may not moderate this competition.
 */
export async function liftCompetitionBan(id, actor, actorRoles) {
  const ban = await db.CompetitionBan.findByPk(id, { raw: true });
  if (!ban) return { removed: false };
  if (!(await canModerateEvent('competition', ban.competition_id, actor, actorRoles))) throw ApiError.forbidden('FORBIDDEN');
  const deleted = await db.CompetitionBan.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

/* -------------------------------------------------------------------------- */
/* Bans — platform-wide                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Applies a platform-wide ban to a user (`profiles.is_banned`). A permanent ban
 * clears `banned_until`; a temporary one sets it. Revokes nothing directly —
 * the auth layer rejects banned users on their next request.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @param {string} [params.reason]
 * @param {boolean} [params.permanent=true]
 * @param {string|Date|null} [params.until] - Expiry for temporary bans.
 * @returns {Promise<object>} The updated profile.
 * @throws {ApiError} 404 when the user has no profile.
 */
export async function banFromPlatform({ userId, adminId, adminName, reason, permanent = true, until = null }) {
  const profile = await db.Profile.findByPk(userId);
  if (!profile) throw ApiError.notFound('NOT_FOUND');
  const now = new Date();

  // Ban must be enforced at the AUTH layer (`users.is_banned`, checked on every
  // request) AND mirrored to the public profile for the admin/display views.
  await db.sequelize.transaction(async (tx) => {
    await db.User.update({ is_banned: true, banned_at: now }, { where: { id: userId }, transaction: tx });
    profile.is_banned = true;
    profile.banned_at = now;
    profile.banned_reason = reason ?? null;
    profile.banned_is_permanent = permanent;
    profile.banned_until = permanent ? null : until;
    await profile.save({ transaction: tx });
  });

  await logAdminAction({
    adminId,
    adminName,
    actionType: 'platform_ban',
    targetType: 'user',
    targetId: userId,
    targetName: profile.full_name,
    details: { reason, permanent, until },
  });
  await notifyUser({
    userId,
    type: 'moderation',
    title: 'Compte suspendu',
    message: reason ? `Votre compte a été suspendu : ${reason}` : 'Votre compte a été suspendu.',
    data: { permanent, until },
    email: true,
    push: false,
  }).catch(() => {});
  return profile;
}

/**
 * Lifts a platform-wide ban.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the user has no profile.
 */
export async function unbanFromPlatform({ userId, adminId, adminName }) {
  const profile = await db.Profile.findByPk(userId);
  if (!profile) throw ApiError.notFound('NOT_FOUND');
  await db.sequelize.transaction(async (tx) => {
    await db.User.update({ is_banned: false, banned_at: null }, { where: { id: userId }, transaction: tx });
    profile.is_banned = false;
    profile.banned_until = null;
    profile.banned_is_permanent = false;
    await profile.save({ transaction: tx });
  });
  await logAdminAction({ adminId, adminName, actionType: 'platform_unban', targetType: 'user', targetId: userId });
  return profile;
}

/**
 * Lists platform-banned users (admin), paginated.
 * @param {object} query
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listPlatformBans(query) {
  const { limit, order, mode, offset } = parsePagination(query, { sortColumn: 'banned_at' });
  const rows = await db.Profile.findAll({
    where: { is_banned: true },
    attributes: ['id', 'full_name', 'email', 'is_banned', 'avatar_url', 'banned_at', 'banned_until', 'banned_reason', 'banned_is_permanent'],
    order,
    limit,
    offset,
    raw: true,
  });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/* -------------------------------------------------------------------------- */
/* Warnings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Issues a warning to a user and notifies them.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.message
 * @param {string} params.issuedBy
 * @param {boolean} [params.isAutomatic=false]
 * @returns {Promise<object>}
 */
export async function issueWarning({ userId, message, issuedBy, isAutomatic = false }) {
  const warning = await db.AccountWarning.create({
    user_id: userId,
    warning_message: message,
    issued_by: issuedBy,
    is_automatic: isAutomatic,
  });
  await notifyUser({
    userId,
    type: 'moderation',
    title: 'Avertissement',
    message,
    data: { warning_id: warning.id },
    email: true,
  }).catch(() => {});
  return warning;
}

/**
 * Returns a user's own warnings (newest first).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listMyWarnings(userId) {
  return db.AccountWarning.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']], raw: true });
}

/**
 * Returns all account warnings platform-wide, newest first (admin; limit 200).
 * @returns {Promise<object[]>}
 */
export async function listAllWarnings() {
  return db.AccountWarning.findAll({ order: [['created_at', 'DESC']], limit: 200, raw: true });
}

export default {
  createReport,
  listReports,
  reviewReport,
  aggregateAccountReports,
  canModerateEvent,
  listCurrentViewers,
  appointModerator,
  revokeModerator,
  listEventModerators,
  banFromStream,
  liftStreamBan,
  listStreamBans,
  listCompetitionBans,
  banFromCompetition,
  liftCompetitionBan,
  banFromPlatform,
  unbanFromPlatform,
  listPlatformBans,
  issueWarning,
  listMyWarnings,
  listAllWarnings,
};
