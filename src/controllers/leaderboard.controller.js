import * as realtime from '../services/leaderboard.realtime.js';
import * as leaderboardService from '../services/leaderboard.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Leaderboards HTTP controllers (thin).
 * @module controllers/leaderboard.controller
 */

/** GET /leaderboards/gifts?contextType=&contextId= — per-context engagement top senders. */
export async function giftEngagement(req, res) {
  return sendSuccess(res, await leaderboardService.getGiftEngagement(req.query));
}

/** GET /leaderboards/seasons */
export async function listSeasons(_req, res) {
  return sendSuccess(res, await leaderboardService.listSeasons());
}

/** GET /leaderboards/artists?limit= — all-time artist leaderboard. */
export async function allTimeArtists(req, res) {
  return sendSuccess(res, await leaderboardService.getAllTimeArtists(req.query.limit));
}

/** GET /leaderboards/donors?limit= — all-time donor leaderboard. */
export async function allTimeDonors(req, res) {
  return sendSuccess(res, await leaderboardService.getAllTimeDonors(req.query.limit));
}

/** GET /leaderboards/winners — all season winners (history). */
export async function allWinners(_req, res) {
  return sendSuccess(res, await leaderboardService.getAllWinners());
}

/** GET /leaderboards/seasons/:id */
export async function getSeason(req, res) {
  return sendSuccess(res, await leaderboardService.getSeason(req.params.id));
}

/** GET /leaderboards/seasons/:id/ranking */
export async function ranking(req, res) {
  return sendSuccess(res, await leaderboardService.getSeasonLeaderboard(req.params.id, req.query.limit));
}

/** GET /leaderboards/seasons/:id/live — real-time top-N (Redis ZSET, SQL fallback). */
export async function live(req, res) {
  const { source, rows } = await realtime.topN(req.params.id, req.query.limit);
  return sendSuccess(res, rows, { meta: { source } });
}

/** GET /leaderboards/seasons/:id/winners */
export async function winners(req, res) {
  return sendSuccess(res, await leaderboardService.listSeasonWinners(req.params.id));
}

/** POST /leaderboards/seasons (admin) */
export async function createSeason(req, res) {
  return sendSuccess(res, await leaderboardService.createSeason(req.body), { status: 201 });
}

/** PATCH /leaderboards/seasons/:id (admin) */
export async function updateSeason(req, res) {
  return sendSuccess(res, await leaderboardService.updateSeason(req.params.id, req.body));
}

/** DELETE /leaderboards/seasons/:id (admin) */
export async function deleteSeason(req, res) {
  return sendSuccess(res, await leaderboardService.deleteSeason(req.params.id));
}

/** POST /leaderboards/seasons/:id/rewards (admin) */
export async function addReward(req, res) {
  return sendSuccess(res, await leaderboardService.addReward(req.params.id, req.body), { status: 201 });
}

/** PATCH /leaderboards/rewards/:id (admin) */
export async function updateReward(req, res) {
  return sendSuccess(res, await leaderboardService.updateReward(req.params.id, req.body));
}

/** DELETE /leaderboards/rewards/:id (admin) */
export async function deleteReward(req, res) {
  return sendSuccess(res, await leaderboardService.deleteReward(req.params.id));
}

/** POST /leaderboards/seasons/:id/winners (admin) */
export async function createWinner(req, res) {
  return sendSuccess(res, await leaderboardService.createSeasonWinner(req.params.id, req.body), { status: 201 });
}

/** PATCH /leaderboards/winners/:id (admin) */
export async function updateWinner(req, res) {
  return sendSuccess(res, await leaderboardService.updateWinner(req.params.id, req.body));
}

/** POST /leaderboards/winners/:id/respond (winner) */
export async function respondMeeting(req, res) {
  return sendSuccess(res, await leaderboardService.respondToMeeting(req.params.id, req.user.id, req.body));
}

/** POST /leaderboards/winners/:id/distribute (admin) */
export async function distributeReward(req, res) {
  return sendSuccess(res, await leaderboardService.distributeReward(req.params.id));
}

/** POST /leaderboards/winners/:id/mark-received (winner) */
export async function markRewardReceived(req, res) {
  return sendSuccess(res, await leaderboardService.markRewardReceived(req.params.id, req.user.id));
}

/** POST /leaderboards/seasons/:id/notify-winners (admin) */
export async function notifyWinners(req, res) {
  return sendSuccess(res, await leaderboardService.notifyWinners(req.params.id));
}

export default {
  giftEngagement,
  listSeasons,
  allTimeArtists,
  allTimeDonors,
  allWinners,
  getSeason,
  ranking,
  live,
  winners,
  createSeason,
  updateSeason,
  deleteSeason,
  addReward,
  updateReward,
  deleteReward,
  createWinner,
  updateWinner,
  respondMeeting,
  distributeReward,
  markRewardReceived,
  notifyWinners,
};
