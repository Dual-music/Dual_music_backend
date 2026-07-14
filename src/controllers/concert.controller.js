import * as concertService from '../services/concert.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Concerts HTTP controllers (thin) — admin concerts + artist concerts.
 * @module controllers/concert.controller
 */

/** GET /concerts */
export async function list(req, res) {
  const { rows, pagination } = await concertService.listConcerts(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /concerts/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await concertService.getConcert(req.params.id));
}

/** POST /concerts (admin) */
export async function create(req, res) {
  return sendSuccess(res, await concertService.createConcert(req.body), { status: 201 });
}

/** PATCH /concerts/:id (admin) — status + replay fields. */
export async function update(req, res) {
  return sendSuccess(res, await concertService.updateConcert(req.params.id, req.body));
}

/** GET /artist-concerts */
export async function listArtist(req, res) {
  const { rows, pagination } = await concertService.listArtistConcerts(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /concerts/:id/ticket-info — caller's ticket (if any) + total sold. */
export async function ticketInfo(req, res) {
  return sendSuccess(res, await concertService.getConcertTicketInfo(req.params.id, req.user?.id ?? null));
}

/** GET /concerts/:id/reminder (auth) */
export async function getReminder(req, res) {
  return sendSuccess(res, await concertService.getMyReminder(req.params.id, req.user.id));
}

/** PUT /concerts/:id/reminder (auth) */
export async function setReminder(req, res) {
  return sendSuccess(res, await concertService.setReminder(req.params.id, req.user.id, req.body?.reminderType));
}

/** DELETE /concerts/:id/reminder (auth) */
export async function removeReminder(req, res) {
  return sendSuccess(res, await concertService.removeReminder(req.params.id, req.user.id));
}

/** GET /artist-concerts/me (artist) — caller's own concerts, all statuses. */
export async function myArtistConcerts(req, res) {
  return sendSuccess(res, await concertService.listMyArtistConcerts(req.user.id));
}

/** GET /artist-concerts/:id — single artist concert (hydrated). */
export async function getArtistConcert(req, res) {
  return sendSuccess(res, await concertService.getArtistConcert(req.params.id));
}

/** POST /artist-concerts (artist) */
export async function createArtist(req, res) {
  return sendSuccess(res, await concertService.createArtistConcert(req.user.id, req.body), { status: 201 });
}

/** PATCH /artist-concerts/:id (owner/admin) */
export async function updateArtist(req, res) {
  return sendSuccess(res, await concertService.updateArtistConcert(req.params.id, req.user.id, req.roles || [], req.body));
}

/** DELETE /artist-concerts/:id (owner/admin) */
export async function removeArtist(req, res) {
  await concertService.deleteArtistConcert(req.params.id, req.user.id, req.roles || []);
  return sendSuccess(res, { success: true });
}

/** POST /artist-concerts/:id/review (admin) */
export async function reviewArtist(req, res) {
  return sendSuccess(res, await concertService.reviewArtistConcert(req.params.id, req.user.id, req.body));
}

/** POST /concerts/dedications */
export async function purchaseDedication(req, res) {
  const result = await concertService.purchaseDedication(req.user.id, req.body);
  return sendSuccess(res, result, { status: 201 });
}

/** POST /concerts/dedications/:id/deliver */
export async function deliverDedication(req, res) {
  return sendSuccess(res, await concertService.deliverDedication(req.params.id, req.user.id, req.roles || []));
}

/** GET /concerts/dedications?concertId=&concertType= */
export async function listDedications(req, res) {
  return sendSuccess(res, await concertService.listConcertDedications(req.query.concertId, req.query.concertType));
}

/** GET /concerts/dedications/me */
export async function myDedications(req, res) {
  return sendSuccess(res, await concertService.listMyDedications(req.user.id));
}

/** GET /concerts/dedications/artist/me — dedications received by the artist. */
export async function artistDedications(req, res) {
  return sendSuccess(res, await concertService.listArtistDedications(req.user.id));
}

/** GET /artist-concerts/titles?ids=a,b — artist-concert titles by id list. */
export async function artistConcertTitles(req, res) {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  return sendSuccess(res, await concertService.getArtistConcertTitles(ids));
}

export default {
  list,
  getOne,
  create,
  update,
  ticketInfo,
  getReminder,
  setReminder,
  removeReminder,
  listArtist,
  myArtistConcerts,
  getArtistConcert,
  createArtist,
  updateArtist,
  removeArtist,
  reviewArtist,
  purchaseDedication,
  deliverDedication,
  listDedications,
  myDedications,
  artistDedications,
  artistConcertTitles,
};
