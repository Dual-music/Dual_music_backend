import * as lifestyleService from '../services/lifestyle.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Lifestyle videos HTTP controllers (thin).
 * @module controllers/lifestyle.controller
 */

/** GET /lifestyle */
export async function list(req, res) {
  const { rows, pagination } = await lifestyleService.listVideos(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /lifestyle/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await lifestyleService.getVideo(req.params.id, req.user?.id ?? null));
}

/** POST /lifestyle */
export async function create(req, res) {
  return sendSuccess(res, await lifestyleService.createVideo(req.user.id, req.body), { status: 201 });
}

/** PATCH /lifestyle/:id */
export async function update(req, res) {
  return sendSuccess(res, await lifestyleService.updateVideo(req.params.id, req.user.id, req.roles || [], req.body));
}

/** DELETE /lifestyle/:id */
export async function remove(req, res) {
  return sendSuccess(res, await lifestyleService.deleteVideo(req.params.id, req.user.id, req.roles || []));
}

/** POST /lifestyle/:id/views */
export async function view(req, res) {
  return sendSuccess(res, await lifestyleService.incrementViews(req.params.id));
}

/** POST /lifestyle/:id/likes */
export async function toggleLike(req, res) {
  return sendSuccess(res, await lifestyleService.toggleLike(req.user.id, req.params.id));
}

/** GET /lifestyle/liked/mine — ids of videos the caller has liked. */
export async function likedByMe(req, res) {
  return sendSuccess(res, await lifestyleService.listLikedVideoIds(req.user.id));
}

export default { list, getOne, create, update, remove, view, toggleLike, likedByMe };
