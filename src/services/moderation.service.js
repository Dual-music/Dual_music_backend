import { QueryTypes } from 'sequelize';

import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';

import { logAdminAction } from './adminLog.service.js';
import { getDisplayProfiles } from './user.service.js';

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

  return db[def.model].create({
    [def.reporterCol]: reporterId,
    [def.targetCol]: targetId,
    reason: input.reason,
    details: input.details ?? null,
    status: 'pending',
  });
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
/* Bans — per-event                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Bans a user from a single stream (duel/live/concert/competition). Broadcasts
 * the ban so the client can force-disconnect the target immediately.
 *
 * @param {object} params
 * @param {string} params.streamId
 * @param {'duel'|'live'|'concert'|'competition'} params.streamType
 * @param {string} params.bannedUserId
 * @param {string} params.bannedBy
 * @param {string} [params.reason]
 * @returns {Promise<object>}
 */
export async function banFromStream({ streamId, streamType, bannedUserId, bannedBy, reason }) {
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
 * Lifts a stream ban. Only the moderator who set it (or an admin, enforced at
 * the route layer) may lift it.
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function liftStreamBan(id) {
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
 * Bans a candidate/viewer from a specific competition.
 * @param {object} params
 * @param {string} params.competitionId
 * @param {string} params.bannedUserId
 * @param {string} params.bannedBy
 * @param {string} [params.reason]
 * @returns {Promise<object>}
 */
export async function banFromCompetition({ competitionId, bannedUserId, bannedBy, reason }) {
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
 * Lifts a competition ban.
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function liftCompetitionBan(id) {
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
