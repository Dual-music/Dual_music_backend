import * as commentService from '../services/comment.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Comments HTTP controllers (thin).
 * @module controllers/comment.controller
 */

/** GET /comments */
export async function list(req, res) {
  return sendSuccess(res, await commentService.listComments(req.query, req.user?.id ?? null));
}

/** POST /comments */
export async function create(req, res) {
  return sendSuccess(res, await commentService.createComment(req.user.id, req.body), { status: 201 });
}

/** DELETE /comments/:id */
export async function remove(req, res) {
  return sendSuccess(res, await commentService.deleteComment(req.params.id, req.user.id, req.roles || []));
}

/** POST /comments/:id/likes */
export async function toggleLike(req, res) {
  return sendSuccess(res, await commentService.toggleLike(req.user.id, req.params.id));
}

export default { list, create, remove, toggleLike };
