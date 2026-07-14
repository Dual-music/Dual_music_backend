import * as moderationService from '../services/moderation.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Moderation HTTP controllers (thin — no business logic).
 * @module controllers/moderation.controller
 */

/** POST /moderation/reports/account */
export async function reportAccount(req, res) {
  const row = await moderationService.createReport('account', req.user.id, req.body);
  return sendSuccess(res, row, { status: 201 });
}

/** POST /moderation/reports/live */
export async function reportLive(req, res) {
  const row = await moderationService.createReport('live', req.user.id, req.body);
  return sendSuccess(res, row, { status: 201 });
}

/** POST /moderation/reports/competition */
export async function reportCompetition(req, res) {
  const row = await moderationService.createReport('competition', req.user.id, req.body);
  return sendSuccess(res, row, { status: 201 });
}

/** GET /moderation/reports/account/aggregate (admin) */
export async function aggregateAccountReports(_req, res) {
  return sendSuccess(res, await moderationService.aggregateAccountReports());
}

/** GET /moderation/reports/:kind */
export async function listReports(req, res) {
  const { rows, pagination } = await moderationService.listReports(req.params.kind, req.query);
  return sendSuccess(res, rows, { pagination });
}

/** PATCH /moderation/reports/:kind/:id */
export async function reviewReport(req, res) {
  const row = await moderationService.reviewReport(
    req.params.kind,
    req.params.id,
    req.user.id,
    req.body.status,
    req.user.email,
  );
  return sendSuccess(res, row);
}

/** POST /moderation/stream-bans */
export async function banStream(req, res) {
  const row = await moderationService.banFromStream({ ...req.body, bannedBy: req.user.id });
  return sendSuccess(res, row, { status: 201 });
}

/** GET /moderation/stream-bans */
export async function listStreamBans(req, res) {
  const rows = await moderationService.listStreamBans(req.query.streamId, req.query.streamType);
  return sendSuccess(res, rows);
}

/** DELETE /moderation/stream-bans/:id */
export async function liftStreamBan(req, res) {
  return sendSuccess(res, await moderationService.liftStreamBan(req.params.id));
}

/** GET /moderation/competition-bans */
export async function listCompetitionBans(req, res) {
  return sendSuccess(res, await moderationService.listCompetitionBans(req.query.competitionId));
}

/** POST /moderation/competition-bans */
export async function banCompetition(req, res) {
  const row = await moderationService.banFromCompetition({ ...req.body, bannedBy: req.user.id });
  return sendSuccess(res, row, { status: 201 });
}

/** DELETE /moderation/competition-bans/:id */
export async function liftCompetitionBan(req, res) {
  return sendSuccess(res, await moderationService.liftCompetitionBan(req.params.id));
}

/** POST /moderation/platform-bans */
export async function banPlatform(req, res) {
  const row = await moderationService.banFromPlatform({
    userId: req.body.userId,
    reason: req.body.reason,
    permanent: req.body.permanent,
    until: req.body.until ?? null,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, row, { status: 201 });
}

/** DELETE /moderation/platform-bans */
export async function unbanPlatform(req, res) {
  const row = await moderationService.unbanFromPlatform({
    userId: req.body.userId,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, row);
}

/** GET /moderation/platform-bans */
export async function listPlatformBans(req, res) {
  const { rows, pagination } = await moderationService.listPlatformBans(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** POST /moderation/warnings */
export async function issueWarning(req, res) {
  const row = await moderationService.issueWarning({
    userId: req.body.userId,
    message: req.body.message,
    issuedBy: req.user.id,
  });
  return sendSuccess(res, row, { status: 201 });
}

/** GET /moderation/warnings/me */
export async function myWarnings(req, res) {
  return sendSuccess(res, await moderationService.listMyWarnings(req.user.id));
}

/** GET /moderation/warnings (admin) */
export async function listWarnings(_req, res) {
  return sendSuccess(res, await moderationService.listAllWarnings());
}

export default {
  reportAccount,
  reportLive,
  reportCompetition,
  aggregateAccountReports,
  listReports,
  reviewReport,
  banStream,
  listStreamBans,
  liftStreamBan,
  listCompetitionBans,
  banCompetition,
  liftCompetitionBan,
  banPlatform,
  unbanPlatform,
  listPlatformBans,
  issueWarning,
  myWarnings,
  listWarnings,
};
