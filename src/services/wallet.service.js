import { QueryTypes } from 'sequelize';

import { db } from '../models/index.js';
import { notifyUser } from '../jobs/notify.js';
import { emitToRoom, emitToUser, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { creditsToEur } from '../utils/money.js';
import { callProcedure } from '../utils/procedures.js';

import { recordGift, recordVote } from './leaderboard.realtime.js';

/**
 * @file Wallet domain service.
 *
 * The credit balance and every debit flow are delegated to atomic MySQL stored
 * procedures (see `src/procedures/wallet.sql` + `revenue.sql`) so that
 * check-and-debit + revenue distribution happen in a single locked transaction.
 * This service is a thin, typed wrapper that invokes those procedures and maps
 * their machine result codes to API errors.
 *
 * @module services/wallet.service
 */

/**
 * Maps a stored-procedure error code to a localized API error.
 * @param {string} code
 * @returns {ApiError}
 */
function errorFromCode(code) {
  switch (code) {
    case 'insufficient_balance':
      return ApiError.badRequest('WALLET_INSUFFICIENT');
    case 'already_purchased':
      return ApiError.conflict('ALREADY_TICKETED');
    case 'sold_out':
      return ApiError.conflict('TICKETS_SOLD_OUT');
    case 'no_inventory':
      return ApiError.badRequest('BAD_REQUEST', { details: { reason: 'no_inventory' } });
    case 'invalid_quantity':
      return ApiError.badRequest('AMOUNT_INVALID');
    case 'gift_not_found':
    case 'duel_not_found':
    case 'concert_not_found':
    case 'replay_not_found':
      return ApiError.notFound('NOT_FOUND');
    default:
      return ApiError.badRequest('BAD_REQUEST', { details: { code } });
  }
}

/**
 * Returns the user's wallet balance (0 when no wallet row exists yet).
 * @param {string} userId
 * @returns {Promise<{ balance: number, eurValue: number }>}
 */
export async function getBalance(userId) {
  const wallet = await db.UserWallet.findByPk(userId);
  const balance = wallet ? Number(wallet.balance) : 0;
  return { balance, eurValue: creditsToEur(balance) };
}

/**
 * Casts a paid vote for an artist in a duel (atomic).
 * @param {string} userId
 * @param {{ duelId: string, artistId: string, amount: number }} input
 * @returns {Promise<{ success: true }>}
 */
export async function voteForDuel(userId, { duelId, artistId, amount }) {
  const out = await callProcedure(
    'deduct_wallet_and_vote',
    [userId, amount, duelId, artistId],
    ['success'],
  );
  if (!out.success) throw ApiError.badRequest('WALLET_INSUFFICIENT');
  // Real-time leaderboard update (best-effort, non-blocking).
  void recordVote({ artistId, donorId: userId, amount: Number(amount) });
  // Live vote tally update for the duel stage.
  emitToRoom('/live', roomName('duel', duelId), 'vote', { duel_id: duelId, artist_id: artistId, amount: Number(amount) });
  return { success: true };
}

/**
 * Buys gifts into the user's inventory (atomic).
 * @param {string} userId
 * @param {{ giftId: string, quantity: number }} input
 * @returns {Promise<{ success: true }>}
 */
export async function purchaseGift(userId, { giftId, quantity }) {
  const out = await callProcedure('purchase_gift_from_wallet', [userId, giftId, quantity], ['success', 'code']);
  if (!out.success) throw errorFromCode(out.code);
  return { success: true };
}

/**
 * Sends an owned gift to a recipient within an event context (atomic + split).
 * @param {string} userId
 * @param {{ giftId: string, toUserId: string, duelId?: string|null, liveId?: string|null, concertId?: string|null }} input
 * @returns {Promise<{ success: true, transactionId: string }>}
 */
export async function sendGift(userId, { giftId, toUserId, duelId = null, liveId = null, concertId = null }) {
  const out = await callProcedure(
    'send_gift_with_distribution',
    [userId, giftId, toUserId, duelId, liveId, concertId],
    ['success', 'code', 'entity_id'],
  );
  if (!out.success) throw errorFromCode(out.code);
  // Real-time leaderboard update (best-effort): use the gift's credit value.
  const gift = await db.VirtualGift.findByPk(giftId, { attributes: ['price'], raw: true });
  const value = Number(gift?.price ?? 0);
  void recordGift({ receiverId: toUserId, senderId: userId, value });
  // Notify the recipient so their transaction toast can fire.
  emitToUser(toUserId, 'tx:gift', { amount: value });
  // Live gift feed on the event stage.
  const ctx = duelId ? ['duel', duelId] : liveId ? ['live', liveId] : concertId ? ['concert', concertId] : null;
  if (ctx) emitToRoom('/live', roomName(ctx[0], ctx[1]), 'gift', { to_user_id: toUserId, from_user_id: userId, value });
  // Notification durable au destinataire (in-app + temps réel + push ; email opt-in).
  void notifyUser({
    userId: toUserId,
    type: 'gift_received',
    title: 'Cadeau reçu 🎁',
    message: `Vous avez reçu un cadeau (${value} crédits).`,
    data: { from_user_id: userId, value },
    email: true,
    push: true,
  }).catch(() => {});
  return { success: true, transactionId: out.entity_id };
}

/**
 * Buys a duel ticket (atomic + split).
 * @param {string} userId
 * @param {string} duelId
 * @returns {Promise<{ success: true, ticketId: string }>}
 */
export async function purchaseDuelTicket(userId, duelId) {
  const out = await callProcedure(
    'purchase_duel_ticket_from_wallet',
    [userId, duelId],
    ['success', 'code', 'entity_id'],
  );
  if (!out.success) throw errorFromCode(out.code);
  return { success: true, ticketId: out.entity_id };
}

/**
 * Buys a concert ticket (atomic + split, capacity-checked).
 * @param {string} userId
 * @param {string} concertId
 * @returns {Promise<{ success: true, ticketId: string, ticketCode: string }>}
 */
export async function purchaseConcertTicket(userId, concertId) {
  const out = await callProcedure(
    'purchase_concert_ticket_from_wallet',
    [userId, concertId],
    ['success', 'code', 'entity_id', 'extra'],
  );
  if (!out.success) throw errorFromCode(out.code);
  return { success: true, ticketId: out.entity_id, ticketCode: out.extra };
}

/**
 * Unlocks replay access (atomic + split).
 * @param {string} userId
 * @param {string} replayId
 * @returns {Promise<{ success: true, accessId: string }>}
 */
export async function purchaseReplayAccess(userId, replayId) {
  const out = await callProcedure(
    'purchase_replay_access_from_wallet',
    [userId, replayId],
    ['success', 'code', 'entity_id'],
  );
  if (!out.success) throw errorFromCode(out.code);
  return { success: true, accessId: out.entity_id };
}

/**
 * Returns the caller's earned revenue grouped by source event.
 * Mirrors `get_my_revenues_by_event`: sums the credits attributed to the user
 * (as artist1/artist2/manager) per source, with transaction counts.
 * @param {string} userId
 * @returns {Promise<Array<{ source_id: string, source_type: string, total_received: number, tx_count: number, last_at: string }>>}
 */
export async function getRevenuesByEvent(userId, since = null) {
  return db.sequelize.query(
    `SELECT source_id, source_type,
            ROUND(SUM(CASE
              WHEN artist1_id = :uid THEN artist1_credits
              WHEN artist2_id = :uid THEN artist2_credits
              WHEN manager_id = :uid THEN manager_credits
              ELSE 0 END), 2) AS total_received,
            COUNT(*) AS tx_count,
            MAX(created_at) AS last_at
       FROM revenue_distributions
      WHERE (artist1_id = :uid OR artist2_id = :uid OR manager_id = :uid)
        AND (:since IS NULL OR created_at >= :since)
      GROUP BY source_id, source_type
      HAVING total_received > 0
      ORDER BY last_at DESC`,
    { replacements: { uid: userId, since }, type: QueryTypes.SELECT },
  );
}

/**
 * Returns the caller's total earned revenue broken down by source type.
 * Mirrors `get_my_revenue_breakdown` — when `sourceId` is provided, the
 * breakdown is scoped to that single source event (`p_source_id`).
 * @param {string} userId
 * @param {string|null} [sourceId] - Optional single source_id to scope to.
 * @returns {Promise<Array<{ source_type: string, total: number }>>}
 */
export async function getRevenueBreakdown(userId, sourceId = null) {
  const sourceFilter = sourceId ? 'AND source_id = :src' : '';
  return db.sequelize.query(
    `SELECT source_type,
            ROUND(SUM(CASE
              WHEN artist1_id = :uid THEN artist1_credits
              WHEN artist2_id = :uid THEN artist2_credits
              WHEN manager_id = :uid THEN manager_credits
              ELSE 0 END), 2) AS total
       FROM revenue_distributions
      WHERE (artist1_id = :uid OR artist2_id = :uid OR manager_id = :uid) ${sourceFilter}
      GROUP BY source_type
      HAVING total > 0`,
    {
      replacements: sourceId ? { uid: userId, src: sourceId } : { uid: userId },
      type: QueryTypes.SELECT,
    },
  );
}

/**
 * Lists the caller's revenue transactions for a specific source event
 * (mirrors `get_my_event_transactions`): per-distribution breakdown with the
 * caller's own share, newest first, paginated by offset.
 * @param {string} userId
 * @param {string} sourceId
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<object[]>}
 */
/**
 * Lists the caller's OUTGOING spending — revenue distributions they paid for
 * (gifts sent, votes, tickets…). Replaces the frontend's former
 * `supabase.from('revenue_distributions').eq('payer_id', me)` read.
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function getMySpending(userId, { limit = 100, offset = 0 } = {}) {
  return db.RevenueDistribution.findAll({
    where: { payer_id: userId },
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(limit) || 100, 500),
    offset: Number(offset) || 0,
    raw: true,
  });
}

export async function getEventTransactions(userId, sourceId, { limit = 25, offset = 0 } = {}) {
  return db.sequelize.query(
    `SELECT id, source_type, created_at, total_credits, platform_credits, manager_credits,
            (artist1_credits + artist2_credits) AS artists_credits,
            CASE
              WHEN artist1_id = :uid THEN artist1_credits
              WHEN artist2_id = :uid THEN artist2_credits
              WHEN manager_id = :uid THEN manager_credits
              ELSE 0 END AS my_credits,
            payer_id
       FROM revenue_distributions
      WHERE source_id = :src AND (artist1_id = :uid OR artist2_id = :uid OR manager_id = :uid)
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset`,
    { replacements: { uid: userId, src: sourceId, limit: Number(limit), offset: Number(offset) }, type: QueryTypes.SELECT },
  );
}

/**
 * Counts the caller's revenue transactions for a source event
 * (mirrors `count_my_event_transactions`).
 * @param {string} userId
 * @param {string} sourceId
 * @returns {Promise<number>}
 */
export async function countEventTransactions(userId, sourceId) {
  const [row] = await db.sequelize.query(
    `SELECT COUNT(*) AS count FROM revenue_distributions
      WHERE source_id = :src AND (artist1_id = :uid OR artist2_id = :uid OR manager_id = :uid)`,
    { replacements: { uid: userId, src: sourceId }, type: QueryTypes.SELECT },
  );
  return Number(row?.count ?? 0);
}

export default {
  getBalance,
  voteForDuel,
  purchaseGift,
  sendGift,
  purchaseDuelTicket,
  purchaseConcertTicket,
  purchaseReplayAccess,
  getRevenuesByEvent,
  getRevenueBreakdown,
  getEventTransactions,
  countEventTransactions,
};
