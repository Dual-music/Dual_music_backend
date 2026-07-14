import * as competitionService from '../services/competition.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Competitions HTTP controllers (thin).
 * @module controllers/competition.controller
 */

/** GET /competitions */
export async function list(req, res) {
  const { rows, pagination } = await competitionService.listCompetitions(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /competitions/:id */
export async function getOne(req, res) {
  return sendSuccess(res, await competitionService.getCompetition(req.params.id));
}

/** GET /competitions/:id/candidates */
export async function candidates(req, res) {
  return sendSuccess(res, await competitionService.listCandidates(req.params.id));
}

/** POST /competitions (manager) */
export async function create(req, res) {
  return sendSuccess(res, await competitionService.createCompetition(req.user.id, req.body), { status: 201 });
}

/** PATCH /competitions/:id (manager/admin) */
export async function update(req, res) {
  return sendSuccess(res, await competitionService.updateCompetition(req.params.id, req.user, req.roles, req.body));
}

/** GET /competitions/mine */
export async function mine(req, res) {
  const { rows, pagination } = await competitionService.listMyCompetitions(req.user.id, req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /competitions/:id/my-ticket */
export async function myTicket(req, res) {
  return sendSuccess(res, await competitionService.getMyTicket(req.user.id, req.params.id));
}

/** GET /competitions/candidacies/mine */
export async function myCandidacies(req, res) {
  return sendSuccess(res, await competitionService.listMyCandidacies(req.user.id));
}

/** GET /competitions/tickets/mine */
export async function myTickets(req, res) {
  return sendSuccess(res, await competitionService.listMyTickets(req.user.id));
}

/** POST /competitions/:id/publish (manager) */
export async function publish(req, res) {
  return sendSuccess(res, await competitionService.publishCompetition(req.params.id, req.user, req.roles));
}

/** POST /competitions/:id/apply (artist) */
export async function apply(req, res) {
  return sendSuccess(res, await competitionService.applyToCompetition(req.user.id, req.params.id, req.body), {
    status: 201,
  });
}

/** POST /competitions/candidates/:id/review (manager) */
export async function reviewCandidate(req, res) {
  return sendSuccess(res, await competitionService.reviewCandidate(req.params.id, req.user, req.roles, req.body));
}

/** POST /competitions/:id/performer (manager) */
export async function setPerformer(req, res) {
  return sendSuccess(
    res,
    await competitionService.setPerformer(req.params.id, req.user, req.roles, req.body.candidateId, req.body.durationSec),
  );
}

/** POST /competitions/:id/focus (manager) */
export async function setFocus(req, res) {
  return sendSuccess(
    res,
    await competitionService.setForcedFocus(req.params.id, req.user, req.roles, req.body.participantId),
  );
}

/** POST /competitions/:id/finalize (manager) */
export async function finalize(req, res) {
  return sendSuccess(res, await competitionService.finalizeRanking(req.params.id, req.user, req.roles));
}

/** POST /competitions/:id/vote */
export async function vote(req, res) {
  return sendSuccess(
    res,
    await competitionService.voteCandidate(req.user.id, { competitionId: req.params.id, ...req.body }),
    { status: 201 },
  );
}

/** POST /competitions/:id/gifts */
export async function gift(req, res) {
  return sendSuccess(
    res,
    await competitionService.sendGift(req.user.id, { competitionId: req.params.id, ...req.body }),
    { status: 201 },
  );
}

/** POST /competitions/:id/tickets */
export async function ticket(req, res) {
  return sendSuccess(res, await competitionService.buyTicket(req.user.id, req.params.id), { status: 201 });
}

export default {
  list,
  getOne,
  candidates,
  create,
  update,
  mine,
  myTicket,
  myCandidacies,
  myTickets,
  publish,
  apply,
  reviewCandidate,
  setPerformer,
  setFocus,
  finalize,
  vote,
  gift,
  ticket,
};
