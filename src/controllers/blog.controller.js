import * as blogService from '../services/blog.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Blog HTTP controllers (thin).
 * @module controllers/blog.controller
 */

/** GET /blogs */
export async function list(req, res) {
  const { rows, pagination } = await blogService.listBlogs(req.query, req.roles || []);
  return sendSuccess(res, rows, { pagination });
}

/** GET /blogs/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await blogService.getBlog(req.params.id, req.roles || []));
}

/** POST /blogs */
export async function create(req, res) {
  return sendSuccess(res, await blogService.createBlog(req.user, req.body), { status: 201 });
}

/** PATCH /blogs/:id */
export async function update(req, res) {
  return sendSuccess(res, await blogService.updateBlog(req.params.id, req.body));
}

/** DELETE /blogs/:id */
export async function remove(req, res) {
  return sendSuccess(res, await blogService.deleteBlog(req.params.id));
}

/** POST /blogs/:id/views */
export async function view(req, res) {
  return sendSuccess(res, await blogService.incrementViews(req.params.id));
}

export default { list, getOne, create, update, remove, view };
