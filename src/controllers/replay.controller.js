import * as replayService from '../services/replay.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Replays HTTP controllers (thin).
 * @module controllers/replay.controller
 */

/** GET /replays */
export async function list(req, res) {
  const { rows, pagination } = await replayService.listReplays(req.query, req.user?.id ?? null);
  return sendSuccess(res, rows, { pagination });
}

/** GET /replays/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await replayService.getReplay(req.params.id, req.user?.id ?? null));
}

/** POST /replays */
export async function create(req, res) {
  return sendSuccess(res, await replayService.createReplay(req.user.id, req.body), { status: 201 });
}

/** PATCH /replays/:id */
export async function update(req, res) {
  return sendSuccess(res, await replayService.updateReplay(req.params.id, req.user.id, req.roles || [], req.body));
}

/** DELETE /replays/:id */
export async function remove(req, res) {
  return sendSuccess(res, await replayService.deleteReplay(req.params.id, req.user.id, req.roles || []));
}

/** POST /replays/:id/views */
export async function view(req, res) {
  return sendSuccess(res, await replayService.incrementViews(req.params.id));
}

/** POST /replays/:id/likes */
export async function toggleLike(req, res) {
  return sendSuccess(res, await replayService.toggleLike(req.user.id, req.params.id));
}

/** GET /replays/:id/access */
export async function access(req, res) {
  return sendSuccess(res, await replayService.checkAccess(req.params.id, req.user?.id ?? null));
}

export default { list, getOne, create, update, remove, view, toggleLike, access };
