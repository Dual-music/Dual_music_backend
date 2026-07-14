import * as duelService from '../services/duel.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Duels HTTP controllers (thin).
 * @module controllers/duel.controller
 */

/** GET /duels */
export async function list(req, res) {
  const { rows, pagination } = await duelService.listDuels(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /duels/batch?ids=a,b — duels by id list (enrichment). */
export async function batch(req, res) {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  return sendSuccess(res, await duelService.getDuelsByIds(ids));
}

/** GET /duels/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await duelService.getDuel(req.params.id));
}

/** GET /duels/:id/votes */
export async function votes(req, res) {
  return sendSuccess(res, await duelService.getVoteTotals(req.params.id));
}

/** GET /duels/votes/batch?ids=a,b,c — bulk per-duel vote tallies. */
export async function votesBatch(req, res) {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  return sendSuccess(res, await duelService.getVoteTotalsByDuelIds(ids));
}

/** POST /duels (admin/manager) */
export async function create(req, res) {
  const duel = await duelService.createDuel(req.user.id, req.roles, req.body);
  return sendSuccess(res, duel, { status: 201 });
}

/** PATCH /duels/:id */
export async function update(req, res) {
  const duel = await duelService.updateDuel(req.params.id, req.user, req.roles, req.body);
  return sendSuccess(res, duel);
}

/** POST /duels/requests */
export async function createRequest(req, res) {
  const request = await duelService.createDuelRequest(req.user.id, req.body);
  return sendSuccess(res, request, { status: 201 });
}

/** POST /duels/requests/:id/respond */
export async function respondRequest(req, res) {
  const result = await duelService.respondDuelRequest(req.params.id, req.user.id, req.body.accept);
  return sendSuccess(res, result);
}

/** GET /duels/requests/mine */
export async function myRequests(req, res) {
  return sendSuccess(res, await duelService.listMyDuelRequests(req.user.id));
}

/** GET /duels/votes/mine — the caller's own paid-vote history. */
export async function myVotes(req, res) {
  return sendSuccess(res, await duelService.getMyVoteHistory(req.user.id));
}

/** GET /duels/:id/my-ticket — whether the caller holds a ticket (+ count). */
export async function myTicket(req, res) {
  return sendSuccess(res, await duelService.getMyDuelTicket(req.params.id, req.user?.id ?? null));
}

export default { list, batch, getOne, votes, votesBatch, myTicket, create, update, createRequest, respondRequest, myRequests, myVotes };
