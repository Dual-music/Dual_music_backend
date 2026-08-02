import { QueryTypes } from 'sequelize';

import { db } from '../models/index.js';
import { notifyUser } from '../jobs/notify.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';

import { startRecording, stopRecording } from './recording.service.js';
import { getDisplayProfiles } from './user.service.js';

/**
 * @file Duels domain service — 1v1 artist battles with paid votes, gifts,
 * threaded chat and replays. Reproduces the `duels` / `duel_requests` /
 * `duel_votes` surface the frontend consumes. Vote casting and gifting are
 * wallet operations (atomic procedures); this service owns lifecycle + reads.
 *
 * @module services/duel.service
 */

/**
 * Hydrates a duel row with both artists' display profiles.
 * @param {object} duel - Plain duel row.
 * @returns {Promise<object>}
 */
async function withArtists(duel) {
  const profiles = await getDisplayProfiles([duel.artist1_id, duel.artist2_id, duel.manager_id].filter(Boolean));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return {
    ...duel,
    artist1: byId.get(duel.artist1_id) || null,
    artist2: byId.get(duel.artist2_id) || null,
    manager: duel.manager_id ? byId.get(duel.manager_id) || null : null,
  };
}

/**
 * Lists duels (optionally filtered by status, participating artist or manager),
 * newest first, paginated.
 * @param {object} query - `status?`, `artistId?`, `managerId?`, pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listDuels(query) {
  const { Op } = db.Sequelize;
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  if (query.managerId) where.manager_id = query.managerId;
  if (query.artistId) {
    // A duel matches when the artist is either combatant; combined via Op.and so
    // it composes with any cursor keyset predicate parsePagination may have set.
    where[Op.and] = [
      ...(where[Op.and] || []),
      { [Op.or]: [{ artist1_id: query.artistId }, { artist2_id: query.artistId }] },
    ];
  }
  const rows = await db.Duel.findAll({ where, order, limit, offset, raw: true });
  const hydrated = await Promise.all(rows.map(withArtists));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a single duel with artists and current vote tallies.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getDuel(id) {
  const duel = await db.Duel.findByPk(id, { raw: true });
  if (!duel) throw ApiError.notFound('NOT_FOUND');
  const enriched = await withArtists(duel);
  enriched.voteTotals = await getVoteTotals(id);
  return enriched;
}

/**
 * Returns paid-vote totals per artist for a duel.
 * @param {string} duelId
 * @returns {Promise<Array<{ artist_id: string, total: number }>>}
 */
export async function getVoteTotals(duelId) {
  return db.sequelize.query(
    `SELECT artist_id, ROUND(SUM(amount), 2) AS total
       FROM duel_votes WHERE duel_id = :id GROUP BY artist_id`,
    { replacements: { id: duelId }, type: QueryTypes.SELECT },
  );
}

/**
 * Bulk paid-vote totals per artist across many duels — powers list-page tallies
 * without an N+1 of per-duel calls. Ids are de-duplicated and capped at 500.
 * @param {string[]} ids - Duel ids.
 * @returns {Promise<Array<{ duel_id: string, artist_id: string, total: number }>>}
 */
export async function getVoteTotalsByDuelIds(ids) {
  const list = [...new Set((ids ?? []).filter(Boolean))].slice(0, 500);
  if (list.length === 0) return [];
  return db.sequelize.query(
    `SELECT duel_id, artist_id, ROUND(SUM(amount), 2) AS total
       FROM duel_votes WHERE duel_id IN (:ids) GROUP BY duel_id, artist_id`,
    { replacements: { ids: list }, type: QueryTypes.SELECT },
  );
}

/**
 * Creates a duel (admin/manager). Manager defaults to the creator when they
 * hold the manager role.
 * @param {string} creatorId
 * @param {string[]} creatorRoles
 * @param {{ artist1Id: string, artist2Id: string, scheduledTime?: string, ticketPrice?: number }} input
 * @returns {Promise<object>}
 */
export async function createDuel(creatorId, creatorRoles, input) {
  if (input.artist1Id === input.artist2Id) throw ApiError.badRequest('BAD_REQUEST');
  return db.Duel.create({
    artist1_id: input.artist1Id,
    artist2_id: input.artist2Id,
    manager_id: creatorRoles.includes('manager') ? creatorId : null,
    scheduled_time: input.scheduledTime ?? null,
    ticket_price: input.ticketPrice ?? 0,
    status: 'upcoming',
  });
}

/**
 * Updates a duel's lifecycle (start/live/end + winner), the persisted live timer
 * (participant/manager/admin) and the admin-only schedule. Participants, the
 * manager or an admin only.
 * @param {string} id
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {{ status?: string, winnerId?: string, roomId?: string,
 *   currentTimerEndsAt?: string|null, currentTimerTargetId?: string|null,
 *   scheduledTime?: string|null }} patch
 * @returns {Promise<object>}
 */
export async function updateDuel(id, actor, roles, patch) {
  const duel = await db.Duel.findByPk(id);
  if (!duel) throw ApiError.notFound('NOT_FOUND');
  const isParticipant = [duel.artist1_id, duel.artist2_id, duel.manager_id].includes(actor.id);
  if (!isParticipant && !roles.includes('admin')) throw ApiError.forbidden('FORBIDDEN');

  if (patch.status) {
    duel.status = patch.status;
    if (patch.status === 'live' && !duel.started_at) duel.started_at = new Date();
    if (patch.status === 'ended' && !duel.ended_at) duel.ended_at = new Date();
  }
  if (patch.winnerId !== undefined) duel.winner_id = patch.winnerId;
  if (patch.roomId !== undefined) duel.room_id = patch.roomId;

  let timerChanged = false;
  if (patch.currentTimerEndsAt !== undefined) {
    duel.current_timer_ends_at = patch.currentTimerEndsAt;
    timerChanged = true;
  }
  if (patch.currentTimerTargetId !== undefined) {
    duel.current_timer_target_id = patch.currentTimerTargetId;
    timerChanged = true;
  }
  if (patch.scheduledTime !== undefined) {
    // Rescheduling is an admin-only action.
    if (!roles.includes('admin')) throw ApiError.forbidden('FORBIDDEN');
    duel.scheduled_time = patch.scheduledTime;
  }

  await duel.save();
  emitToRoom('/live', roomName('duel', id), 'status', {
    duel_id: id,
    status: duel.status,
    winner_id: duel.winner_id,
    room_id: duel.room_id,
  });
  if (timerChanged) {
    emitToRoom('/live', roomName('duel', id), 'timer', {
      duel_id: id,
      ends_at: duel.current_timer_ends_at,
      target_id: duel.current_timer_target_id,
    });
  }
  // Egress : enregistre le duel du passage en live à la fin (no-op si egress désactivé).
  if (patch.status === 'live') void startRecording({ sourceType: 'duel', sourceId: id, artistId: duel.artist1_id, createdBy: duel.manager_id || duel.artist1_id }).catch(() => {});
  if (patch.status === 'ended') void stopRecording({ sourceType: 'duel', sourceId: id }).catch(() => {});
  // Notifie le vainqueur quand un gagnant est annoncé.
  if (patch.winnerId) {
    void notifyUser({
      userId: duel.winner_id,
      type: 'duel_result',
      title: 'Vous avez gagné le duel 🏆',
      message: 'Félicitations, vous êtes le vainqueur du duel !',
      data: { duel_id: id },
      push: true,
    }).catch(() => {});
  }
  return duel;
}

/**
 * Creates a duel request from one artist to another.
 * @param {string} requesterId
 * @param {{ opponentId: string, proposedDate?: string, message?: string, managerId?: string }} input
 * @returns {Promise<object>}
 */
export async function createDuelRequest(requesterId, input) {
  if (requesterId === input.opponentId) throw ApiError.badRequest('BAD_REQUEST');
  return db.DuelRequest.create({
    requester_id: requesterId,
    opponent_id: input.opponentId,
    proposed_date: input.proposedDate ?? null,
    message: input.message ?? null,
    manager_id: input.managerId ?? null,
    status: 'pending',
  });
}

/**
 * Responds to a duel request (opponent accepts/declines). On accept, a duel is
 * created between the two artists.
 * @param {string} requestId
 * @param {string} responderId
 * @param {boolean} accept
 * @returns {Promise<{ request: object, duel: object|null }>}
 */
export async function respondDuelRequest(requestId, responderId, accept) {
  return db.sequelize.transaction(async (tx) => {
    const req = await db.DuelRequest.findByPk(requestId, { transaction: tx });
    if (!req) throw ApiError.notFound('NOT_FOUND');
    if (req.opponent_id !== responderId) throw ApiError.forbidden('FORBIDDEN');
    if (req.status !== 'pending') throw ApiError.conflict('CONFLICT');

    req.status = accept ? 'accepted' : 'declined';
    req.updated_at = new Date();
    await req.save({ transaction: tx });

    let duel = null;
    if (accept) {
      duel = await db.Duel.create(
        {
          artist1_id: req.requester_id,
          artist2_id: req.opponent_id,
          manager_id: req.manager_id ?? null,
          scheduled_time: req.proposed_date ?? null,
          status: 'upcoming',
        },
        { transaction: tx },
      );
    }
    return { request: req, duel };
  });
}

/**
 * Lists duel requests addressed to or created by a user.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listMyDuelRequests(userId) {
  const { Op } = db.Sequelize;
  return db.DuelRequest.findAll({
    where: { [Op.or]: [{ requester_id: userId }, { opponent_id: userId }] },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Returns the caller's own paid-vote history (newest first, limit 100), enriched
 * with the duel's display title (both artists' names) and the voted-for artist's
 * display profile.
 * @param {string} userId
 * @returns {Promise<Array<{ id, duel_id, artist_id, amount, created_at, duel_title, artist }>>}
 */
export async function getMyVoteHistory(userId) {
  const { Op } = db.Sequelize;
  const votes = await db.DuelVote.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit: 100,
    raw: true,
  });
  if (votes.length === 0) return [];

  const duelIds = [...new Set(votes.map((v) => v.duel_id).filter(Boolean))];
  const duels = duelIds.length
    ? await db.Duel.findAll({ where: { id: { [Op.in]: duelIds } }, attributes: ['id', 'artist1_id', 'artist2_id'], raw: true })
    : [];
  const duelById = new Map(duels.map((d) => [d.id, d]));

  const profileIds = [
    ...votes.map((v) => v.artist_id),
    ...duels.flatMap((d) => [d.artist1_id, d.artist2_id]),
  ].filter(Boolean);
  const profiles = await getDisplayProfiles(profileIds);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return votes.map((v) => {
    const duel = duelById.get(v.duel_id) || null;
    const title = duel
      ? `${profileById.get(duel.artist1_id)?.full_name ?? 'Artiste 1'} vs ${profileById.get(duel.artist2_id)?.full_name ?? 'Artiste 2'}`
      : null;
    return {
      id: v.id,
      duel_id: v.duel_id,
      artist_id: v.artist_id,
      amount: Number(v.amount),
      created_at: v.created_at,
      duel_title: title,
      artist: profileById.get(v.artist_id) || null,
    };
  });
}

/**
 * Returns whether the caller holds a ticket for a duel (+ total sold).
 * @param {string} duelId
 * @param {string|null} userId
 * @returns {Promise<{ hasTicket: boolean, count: number }>}
 */
/**
 * Batch-fetches duels by id (for list enrichment), each with artist ids.
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
export async function getDuelsByIds(ids) {
  const list = [...new Set((ids ?? []).filter(Boolean))].slice(0, 500);
  if (list.length === 0) return [];
  const { Op } = db.Sequelize;
  return db.Duel.findAll({
    where: { id: { [Op.in]: list } },
    attributes: ['id', 'artist1_id', 'artist2_id', 'status', 'winner_id', 'scheduled_time'],
    raw: true,
  });
}

export async function getMyDuelTicket(duelId, userId) {
  const [ticket, count] = await Promise.all([
    userId ? db.DuelTicket.findOne({ where: { duel_id: duelId, user_id: userId }, raw: true }) : Promise.resolve(null),
    db.DuelTicket.count({ where: { duel_id: duelId } }),
  ]);
  return { hasTicket: !!ticket, count };
}

export default {
  listDuels,
  getDuel,
  getDuelsByIds,
  getMyDuelTicket,
  getVoteTotals,
  getVoteTotalsByDuelIds,
  createDuel,
  updateDuel,
  createDuelRequest,
  respondDuelRequest,
  listMyDuelRequests,
  getMyVoteHistory,
};
