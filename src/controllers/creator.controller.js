import * as creatorService from '../services/creator.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Creator (artist/manager) HTTP controllers (thin).
 * @module controllers/creator.controller
 */

/** POST /artists/requests */
export async function applyArtist(req, res) {
  const result = await creatorService.applyAsArtist(req.user.id, req.body);
  return sendSuccess(res, result, { status: 201 });
}

/** POST /managers/requests */
export async function applyManager(req, res) {
  const result = await creatorService.applyAsManager(req.user.id, req.body);
  return sendSuccess(res, result, { status: 201 });
}

/** GET /artists/requests (admin) */
export async function listArtistRequests(req, res) {
  const { rows, pagination } = await creatorService.listRequests('artist', req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /managers/requests (admin) */
export async function listManagerRequests(req, res) {
  const { rows, pagination } = await creatorService.listRequests('manager', req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /artists/requests/me — the caller's own artist applications. */
export async function myArtistRequests(req, res) {
  return sendSuccess(res, await creatorService.listMyRequests('artist', req.user.id));
}

/** GET /managers/requests/me — the caller's own manager applications. */
export async function myManagerRequests(req, res) {
  return sendSuccess(res, await creatorService.listMyRequests('manager', req.user.id));
}

/** POST /artists/requests/:id/review (admin) */
export async function reviewArtistRequest(req, res) {
  const result = await creatorService.reviewArtistRequest(req.params.id, req.user.id, req.body);
  return sendSuccess(res, result);
}

/** POST /managers/requests/:id/review (admin) */
export async function reviewManagerRequest(req, res) {
  const result = await creatorService.reviewManagerRequest(req.params.id, req.user.id, req.body);
  return sendSuccess(res, result);
}

/** PATCH /artists/me (artist) */
export async function updateArtistProfile(req, res) {
  const result = await creatorService.updateArtistProfile(req.user.id, req.body);
  return sendSuccess(res, result);
}

/** PATCH /managers/me (manager) */
export async function updateManagerProfile(req, res) {
  const result = await creatorService.updateManagerProfile(req.user.id, req.body);
  return sendSuccess(res, result);
}

/** GET /managers/me (manager) — read own profile. */
export async function myManagerProfile(req, res) {
  return sendSuccess(res, await creatorService.getMyManagerProfile(req.user.id));
}

/** GET /managers/:id — public manager profile (optionalAuth for owner view). */
export async function getManagerById(req, res) {
  return sendSuccess(res, await creatorService.getPublicManagerProfile(req.params.id, req.user?.id ?? null));
}

/** GET /artists */
export async function listArtists(req, res) {
  const { rows, pagination } = await creatorService.listArtists(req.query);
  return sendSuccess(res, rows, { pagination });
}

export default {
  applyArtist,
  applyManager,
  listArtistRequests,
  listManagerRequests,
  myArtistRequests,
  myManagerRequests,
  reviewArtistRequest,
  reviewManagerRequest,
  updateArtistProfile,
  updateManagerProfile,
  myManagerProfile,
  getManagerById,
  listArtists,
};
