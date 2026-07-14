import * as walletService from '../services/wallet.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Wallet HTTP controllers (thin). Financial actions delegate to atomic
 * stored-procedure-backed service methods.
 * @module controllers/wallet.controller
 */

/** GET /wallet */
export async function getBalance(req, res) {
  const data = await walletService.getBalance(req.user.id);
  return sendSuccess(res, data);
}

/** GET /wallet/revenues */
export async function getRevenues(req, res) {
  const data = await walletService.getRevenuesByEvent(req.user.id, req.query.since ?? null);
  return sendSuccess(res, data);
}

/** GET /wallet/spending?limit=&offset= — the caller's outgoing payments. */
export async function getSpending(req, res) {
  const { limit, offset } = req.query;
  return sendSuccess(res, await walletService.getMySpending(req.user.id, { limit, offset }));
}

/** GET /wallet/revenues/breakdown */
/** GET /wallet/transactions?sourceId=&limit=&offset= */
export async function getEventTransactions(req, res) {
  const { sourceId, limit, offset } = req.query;
  const [rows, total] = await Promise.all([
    walletService.getEventTransactions(req.user.id, sourceId, { limit, offset }),
    walletService.countEventTransactions(req.user.id, sourceId),
  ]);
  return sendSuccess(res, rows, { meta: { total } });
}

/** GET /wallet/revenues/breakdown?sourceId= */
export async function getRevenueBreakdown(req, res) {
  const data = await walletService.getRevenueBreakdown(req.user.id, req.query.sourceId ?? null);
  return sendSuccess(res, data);
}

/** POST /wallet/vote */
export async function vote(req, res) {
  const data = await walletService.voteForDuel(req.user.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

/** POST /wallet/gifts/purchase */
export async function purchaseGift(req, res) {
  const data = await walletService.purchaseGift(req.user.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

/** POST /wallet/gifts/send */
export async function sendGift(req, res) {
  const data = await walletService.sendGift(req.user.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

/** POST /wallet/tickets/duel */
export async function buyDuelTicket(req, res) {
  const data = await walletService.purchaseDuelTicket(req.user.id, req.body.duelId);
  return sendSuccess(res, data, { status: 201 });
}

/** POST /wallet/tickets/concert */
export async function buyConcertTicket(req, res) {
  const data = await walletService.purchaseConcertTicket(req.user.id, req.body.concertId);
  return sendSuccess(res, data, { status: 201 });
}

/** POST /wallet/replays/unlock */
export async function unlockReplay(req, res) {
  const data = await walletService.purchaseReplayAccess(req.user.id, req.body.replayId);
  return sendSuccess(res, data, { status: 201 });
}

export default {
  getSpending,
  getBalance,
  getRevenues,
  getRevenueBreakdown,
  getEventTransactions,
  vote,
  purchaseGift,
  sendGift,
  buyDuelTicket,
  buyConcertTicket,
  unlockReplay,
};
