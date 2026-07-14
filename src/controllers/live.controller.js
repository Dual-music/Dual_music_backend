import * as liveService from '../services/live.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Lives HTTP controllers (thin).
 * @module controllers/live.controller
 */

/** GET /lives */
export async function list(req, res) {
  const { rows, pagination } = await liveService.listLives(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /lives/titles?ids=a,b — resolve live titles by id list (enrichment). */
export async function titles(req, res) {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  return sendSuccess(res, await liveService.getLiveTitlesByIds(ids));
}

/** GET /lives/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await liveService.getLive(req.params.id));
}

/** GET /lives/:id/reports/summary — report count + caller's own report status. */
export async function reportSummary(req, res) {
  return sendSuccess(res, await liveService.getReportSummary(req.params.id, req.user?.id ?? null));
}

/** POST /lives (artist) */
export async function start(req, res) {
  return sendSuccess(res, await liveService.startLive(req.user.id, req.body), { status: 201 });
}

/** POST /lives/:id/end */
export async function end(req, res) {
  return sendSuccess(res, await liveService.endLive(req.params.id, req.user.id, req.roles || []));
}

/** PATCH /lives/:id — host or admin/moderator updates lifecycle status. */
export async function updateStatus(req, res) {
  return sendSuccess(res, await liveService.updateLiveStatus(req.params.id, req.user.id, req.roles || [], req.body.status));
}

/** DELETE /lives/join-requests/:id — requester (or host/admin) cancels a request. */
export async function cancelJoin(req, res) {
  return sendSuccess(res, await liveService.cancelJoinRequest(req.params.id, req.user.id, req.roles || []));
}

/** POST /lives/:id/likes */
export async function like(req, res) {
  return sendSuccess(res, await liveService.incrementLikes(req.params.id));
}

/** GET /lives/:id/likes — current like count (no increment). */
export async function likes(req, res) {
  return sendSuccess(res, await liveService.getLikes(req.params.id));
}

/** GET /lives/:id/join-requests?status= — host/admin lists join requests. */
export async function joinRequests(req, res) {
  return sendSuccess(res, await liveService.listJoinRequests(req.params.id, req.query.status));
}

/** POST /lives/:id/join */
export async function join(req, res) {
  return sendSuccess(res, await liveService.requestJoin(req.params.id, req.user.id), { status: 201 });
}

/** POST /lives/join-requests/:id/respond */
export async function respondJoin(req, res) {
  return sendSuccess(res, await liveService.respondJoin(req.params.id, req.user.id, req.body.status));
}

export default { list, titles, getOne, reportSummary, start, end, updateStatus, like, likes, joinRequests, join, respondJoin, cancelJoin };
