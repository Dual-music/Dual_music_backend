import * as sponsorService from '../services/sponsor.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Sponsors HTTP controllers (thin).
 * @module controllers/sponsor.controller
 */

/** GET /sponsors/tiers */
export async function listTiers(req, res) {
  return sendSuccess(res, await sponsorService.listTiers(req.query.all !== 'true'));
}

/** POST /sponsors/tiers (admin) */
export async function createTier(req, res) {
  return sendSuccess(res, await sponsorService.createTier(req.body), { status: 201 });
}

/** PATCH /sponsors/tiers/:id (admin) */
export async function updateTier(req, res) {
  return sendSuccess(res, await sponsorService.updateTier(req.params.id, req.body));
}

/** DELETE /sponsors/tiers/:id (admin) */
export async function deleteTier(req, res) {
  return sendSuccess(res, await sponsorService.deleteTier(req.params.id));
}

/** POST /sponsors/requests */
export async function createRequest(req, res) {
  return sendSuccess(res, await sponsorService.createRequest(req.user.id, req.body), { status: 201 });
}

/** POST /sponsors/requests/:id/pay */
export async function payRequest(req, res) {
  return sendSuccess(res, await sponsorService.payRequest(req.user.id, req.params.id));
}

/** GET /sponsors/requests (admin) */
export async function listRequests(req, res) {
  const { rows, pagination } = await sponsorService.listRequests(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /sponsors/requests/me */
export async function myRequests(req, res) {
  return sendSuccess(res, await sponsorService.listMyRequests(req.user.id));
}

/** PATCH /sponsors/requests/:id/review (admin) */
export async function reviewRequest(req, res) {
  const row = await sponsorService.reviewRequest({
    id: req.params.id,
    reviewerId: req.user.id,
    status: req.body.status,
    rejectedReason: req.body.rejected_reason,
  });
  return sendSuccess(res, row);
}

/** GET /sponsors/default-price?duration= */
export async function defaultPrice(req, res) {
  return sendSuccess(res, await sponsorService.defaultPrice(Number(req.query.duration)));
}

/** PATCH /sponsors/requests/:id/price (admin) */
export async function setRequestPrice(req, res) {
  const row = await sponsorService.setRequestPrice({ id: req.params.id, priceCredits: req.body.priceCredits, adminId: req.user.id });
  return sendSuccess(res, row);
}

/** PATCH /sponsors/requests/:id/approve-reuse (admin) */
export async function approveReuseMedia(req, res) {
  const row = await sponsorService.approveReuseMedia({
    id: req.params.id,
    mediaUrl: req.body.mediaUrl,
    durationSeconds: req.body.durationSeconds,
    adminId: req.user.id,
  });
  return sendSuccess(res, row);
}

/** PATCH /sponsors/deadline (admin) — set an event's sponsor submission deadline. */
export async function setDeadline(req, res) {
  return sendSuccess(res, await sponsorService.setSubmissionDeadline(req.body));
}

/** GET /sponsors/ads/history?eventId=&eventType= */
export async function adHistory(req, res) {
  return sendSuccess(res, await sponsorService.listAdHistory(req.query.eventId, req.query.eventType));
}

/** GET /sponsors/ads */
export async function listAdVideos(req, res) {
  return sendSuccess(res, await sponsorService.listAdVideos(req.query.eventId, req.query.eventType));
}

/** GET /sponsors/ad-videos (admin) — all ad videos incl. inactive. */
export async function listAllAdVideos(_req, res) {
  return sendSuccess(res, await sponsorService.listAllAdVideos());
}

/** POST /sponsors/ad-videos (admin) */
export async function createAdVideo(req, res) {
  return sendSuccess(res, await sponsorService.createAdVideo({ ...req.body, uploadedBy: req.user.id }), { status: 201 });
}

/** PATCH /sponsors/ad-videos/:id (admin) */
export async function updateAdVideo(req, res) {
  return sendSuccess(res, await sponsorService.updateAdVideo(req.params.id, req.body));
}

/** POST /sponsors/ads/play */
export async function startAd(req, res) {
  const row = await sponsorService.startAd({ ...req.body, triggeredBy: req.user.id });
  return sendSuccess(res, row, { status: 201 });
}

/** POST /sponsors/ads/plays/:id/stop */
export async function stopAd(req, res) {
  return sendSuccess(res, await sponsorService.stopAd(req.params.id));
}

export default {
  listTiers,
  defaultPrice,
  createTier,
  updateTier,
  deleteTier,
  createRequest,
  payRequest,
  listRequests,
  myRequests,
  reviewRequest,
  setRequestPrice,
  approveReuseMedia,
  setDeadline,
  listAdVideos,
  listAllAdVideos,
  createAdVideo,
  updateAdVideo,
  adHistory,
  startAd,
  stopAd,
};
