import { QueryTypes } from 'sequelize';

import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { callProcedure } from '../utils/procedures.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Leaderboards domain service.
 *
 * Reproduces the Postgres `get_season_leaderboard(p_season_id, p_limit)` RPC in
 * MySQL. Two scoring models keyed off `leaderboard_seasons.type`:
 *
 *  - **artist**: `score = votes*10 + gifts_received_value*5 + wins*50`
 *  - **donor**:  `score = gifts_sent_value + votes_cast_amount`
 *
 * MySQL has no `FULL OUTER JOIN`, so the donor branch unions the key sets
 * (`gifts_sent` ∪ `votes_cast`) before the outer joins. Windowed `ROW_NUMBER`
 * assigns `rank_position`. Also owns season/reward CRUD and season winners.
 *
 * @module services/leaderboard.service
 */

/**
 * Clamps a caller-supplied limit to a safe integer (avoids SQL-injection via
 * LIMIT and unbounded scans).
 * @param {unknown} value
 * @returns {number} 1..200
 */
function safeLimit(value) {
  const n = Math.floor(Number(value) || 50);
  return Math.min(Math.max(n, 1), 200);
}

const ARTIST_SQL = `
WITH window_votes AS (
  SELECT artist_id AS uid, COALESCE(SUM(amount),0) AS v
  FROM duel_votes WHERE created_at BETWEEN :start AND :end GROUP BY artist_id
),
window_gifts AS (
  SELECT gt.to_user_id AS uid, COUNT(*) AS g_count, COALESCE(SUM(vg.price),0) AS g_value
  FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
  WHERE gt.created_at BETWEEN :start AND :end GROUP BY gt.to_user_id
),
window_wins AS (
  SELECT winner_id AS uid, COUNT(*) AS w
  FROM duels
  WHERE winner_id IS NOT NULL
    AND COALESCE(ended_at, started_at, scheduled_time, created_at) BETWEEN :start AND :end
  GROUP BY winner_id
),
combined AS (
  SELECT ap.user_id AS uid, COALESCE(wv.v,0) AS v,
         COALESCE(wg.g_count,0) AS g_count, COALESCE(wg.g_value,0) AS g_value, COALESCE(ww.w,0) AS w
  FROM artist_profiles ap
  LEFT JOIN window_votes wv ON wv.uid = ap.user_id
  LEFT JOIN window_gifts wg ON wg.uid = ap.user_id
  LEFT JOIN window_wins  ww ON ww.uid = ap.user_id
),
scored AS (
  SELECT uid, v AS total_votes, g_value AS total_gifts_received, w AS total_wins,
         0 AS total_donated, 0 AS gifts_sent, 0 AS votes_cast,
         (v*10 + g_value*5 + w*50) AS score
  FROM combined WHERE v>0 OR g_value>0 OR w>0
)
SELECT s.uid AS user_id, p.full_name, ap.avatar_url, ap.stage_name,
       s.total_votes, s.total_gifts_received, s.total_wins, s.total_donated, s.gifts_sent, s.votes_cast, s.score,
       ROW_NUMBER() OVER (ORDER BY s.score DESC, s.total_votes DESC) AS rank_position
FROM scored s
LEFT JOIN profiles p ON p.id = s.uid
LEFT JOIN artist_profiles ap ON ap.user_id = s.uid
ORDER BY s.score DESC, s.total_votes DESC
LIMIT :limit`;

const DONOR_SQL = `
WITH gifts_sent AS (
  SELECT gt.from_user_id AS uid, COUNT(*) AS g_count, COALESCE(SUM(vg.price),0) AS g_value
  FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
  WHERE gt.created_at BETWEEN :start AND :end GROUP BY gt.from_user_id
),
votes_cast AS (
  SELECT user_id AS uid, COALESCE(SUM(amount),0) AS v
  FROM duel_votes WHERE created_at BETWEEN :start AND :end GROUP BY user_id
),
ky AS (
  SELECT uid FROM gifts_sent UNION SELECT uid FROM votes_cast
),
combined AS (
  SELECT k.uid, COALESCE(g.g_count,0) AS g_count, COALESCE(g.g_value,0) AS g_value, COALESCE(vc.v,0) AS v
  FROM ky k
  LEFT JOIN gifts_sent g ON g.uid = k.uid
  LEFT JOIN votes_cast vc ON vc.uid = k.uid
),
scored AS (
  SELECT uid, 0 AS total_votes, 0 AS total_gifts_received, 0 AS total_wins,
         (g_value+v) AS total_donated, g_count AS gifts_sent, v AS votes_cast, (g_value+v) AS score
  FROM combined WHERE (g_value+v) > 0
)
SELECT s.uid AS user_id, p.full_name, p.avatar_url, NULL AS stage_name,
       s.total_votes, s.total_gifts_received, s.total_wins, s.total_donated, s.gifts_sent, s.votes_cast, s.score,
       ROW_NUMBER() OVER (ORDER BY s.score DESC, s.total_donated DESC) AS rank_position
FROM scored s
LEFT JOIN profiles p ON p.id = s.uid
ORDER BY s.score DESC, s.total_donated DESC
LIMIT :limit`;

/**
 * Computes the ranked leaderboard for a season within its date window.
 * @param {string} seasonId
 * @param {number} [limit=50]
 * @returns {Promise<object[]>} Ranked rows (see file header for columns).
 * @throws {ApiError} 404 when the season does not exist.
 */
export async function getSeasonLeaderboard(seasonId, limit = 50) {
  const season = await db.LeaderboardSeason.findByPk(seasonId, { raw: true });
  if (!season) throw ApiError.notFound('NOT_FOUND');
  const sql = season.type === 'artist' ? ARTIST_SQL : DONOR_SQL;
  return db.sequelize.query(sql, {
    replacements: { start: season.start_date, end: season.end_date, limit: safeLimit(limit) },
    type: QueryTypes.SELECT,
  });
}

/* -------------------------------------------------------------------------- */
/* Seasons & rewards                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Lists all seasons (newest first) with their rewards attached.
 * @returns {Promise<object[]>}
 */
export async function listSeasons() {
  const seasons = await db.LeaderboardSeason.findAll({ order: [['start_date', 'DESC']], raw: true });
  const rewards = await db.LeaderboardReward.findAll({ raw: true });
  const bySeason = new Map();
  for (const r of rewards) {
    if (!bySeason.has(r.season_id)) bySeason.set(r.season_id, []);
    bySeason.get(r.season_id).push(r);
  }
  return seasons.map((s) => ({ ...s, rewards: bySeason.get(s.id) ?? [] }));
}

/**
 * Returns one season with its rewards.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function getSeason(id) {
  const season = await db.LeaderboardSeason.findByPk(id, { raw: true });
  if (!season) throw ApiError.notFound('NOT_FOUND');
  const rewards = await db.LeaderboardReward.findAll({ where: { season_id: id }, raw: true });
  return { ...season, rewards };
}

/**
 * Creates a season (admin).
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function createSeason(input) {
  return db.LeaderboardSeason.create({
    name: input.name,
    type: input.type,
    start_date: input.start_date,
    end_date: input.end_date,
    is_active: input.is_active ?? true,
    is_mystery_reward: input.is_mystery_reward ?? false,
  });
}

/**
 * Updates a season (admin, whitelisted fields).
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function updateSeason(id, patch) {
  const season = await db.LeaderboardSeason.findByPk(id);
  if (!season) throw ApiError.notFound('NOT_FOUND');
  for (const key of ['name', 'type', 'start_date', 'end_date', 'is_active', 'is_mystery_reward']) {
    if (patch[key] !== undefined) season[key] = patch[key];
  }
  await season.save();
  return season;
}

/**
 * Deletes a season and its rewards (admin).
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteSeason(id) {
  await db.LeaderboardReward.destroy({ where: { season_id: id } });
  const deleted = await db.LeaderboardSeason.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

/**
 * Adds a reward tier to a season (admin).
 * @param {string} seasonId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function addReward(seasonId, input) {
  return db.LeaderboardReward.create({
    season_id: seasonId,
    rank_position: input.rank_position,
    reward_type: input.reward_type ?? 'credits',
    credits_amount: input.credits_amount ?? null,
    virtual_gift_id: input.virtual_gift_id ?? null,
    physical_description: input.physical_description ?? null,
  });
}

/**
 * Updates a reward (admin, whitelisted fields).
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function updateReward(id, patch) {
  const reward = await db.LeaderboardReward.findByPk(id);
  if (!reward) throw ApiError.notFound('NOT_FOUND');
  for (const key of ['rank_position', 'reward_type', 'credits_amount', 'virtual_gift_id', 'physical_description']) {
    if (patch[key] !== undefined) reward[key] = patch[key];
  }
  await reward.save();
  return reward;
}

/**
 * Deletes a reward (admin).
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteReward(id) {
  const deleted = await db.LeaderboardReward.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

/* -------------------------------------------------------------------------- */
/* Winners                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Lists the recorded winners of a season with display profiles (rank order).
 * @param {string} seasonId
 * @returns {Promise<object[]>}
 */
export async function listSeasonWinners(seasonId) {
  const winners = await db.SeasonWinner.findAll({
    where: { season_id: seasonId },
    order: [['rank_position', 'ASC']],
    raw: true,
  });
  const profiles = await getDisplayProfiles(winners.map((w) => w.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return winners.map((w) => ({ ...w, user: byId.get(w.user_id) ?? null }));
}

/**
 * Records a season winner (admin). Reward/meeting statuses default to their
 * initial states when not supplied.
 * @param {string} seasonId
 * @param {object} input - `userId`, `rankPosition`, optional statuses/notes.
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the season does not exist.
 */
export async function createSeasonWinner(seasonId, input) {
  const season = await db.LeaderboardSeason.findByPk(seasonId, { attributes: ['id'], raw: true });
  if (!season) throw ApiError.notFound('NOT_FOUND');
  return db.SeasonWinner.create({
    season_id: seasonId,
    user_id: input.userId,
    rank_position: input.rankPosition,
    reward_status: input.rewardStatus ?? 'pending',
    meeting_status: input.meetingStatus ?? 'none',
    notes: input.notes ?? null,
  });
}

/**
 * Updates a winner's reward/meeting record (admin).
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found.
 */
export async function updateWinner(id, patch) {
  const winner = await db.SeasonWinner.findByPk(id);
  if (!winner) throw ApiError.notFound('NOT_FOUND');
  const allowed = [
    'reward_status',
    'meeting_status',
    'meeting_when',
    'meeting_location',
    'meeting_notes',
    'meeting_proposed_by',
    'notes',
    'distributed_at',
    'received_at',
    'notified_winner_at',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) winner[key] = patch[key];
  }
  await winner.save();
  return winner;
}

/**
 * Lets a winner respond to a proposed meeting (accept or counter-propose).
 * Owner-scoped: a winner may only mutate their own record.
 * @param {string} id
 * @param {string} userId
 * @param {object} patch - `meeting_status` and optional `counter_*` fields.
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found for this user.
 */
export async function respondToMeeting(id, userId, patch) {
  const winner = await db.SeasonWinner.findOne({ where: { id, user_id: userId } });
  if (!winner) throw ApiError.notFound('NOT_FOUND');
  for (const key of ['meeting_status', 'counter_when', 'counter_location', 'counter_notes', 'counter_proposed_at']) {
    if (patch[key] !== undefined) winner[key] = patch[key];
  }
  await winner.save();
  return winner;
}

/**
 * Distributes a winner's reward atomically (credits → wallet, virtual gift →
 * inventory, physical/mystery → mark distributed) via
 * `distribute_season_reward`, then notifies the winner.
 * @param {string} winnerId
 * @returns {Promise<{ rewardType: string, status: 'received'|'distributed' }>}
 * @throws {ApiError} 404 winner · 400 no reward defined.
 */
export async function distributeReward(winnerId) {
  const out = await callProcedure(
    'distribute_season_reward',
    [winnerId],
    ['success', 'code', 'reward_type', 'user_id'],
  );
  if (!out.success) {
    if (out.code === 'not_found') throw ApiError.notFound('NOT_FOUND');
    if (out.code === 'no_reward_defined') throw ApiError.badRequest('REWARD_NOT_DEFINED');
    throw ApiError.badRequest('BAD_REQUEST', { details: { code: out.code } });
  }
  const isMaterial = out.reward_type === 'credits' || out.reward_type === 'virtual_gift';
  await notifyUser({
    userId: out.user_id,
    type: 'reward',
    title: isMaterial ? 'Récompense reçue !' : 'Récompense à organiser',
    message: isMaterial
      ? 'Votre récompense de saison a été créditée.'
      : "Votre récompense est prête. L'admin vous proposera un rendez-vous pour la remise.",
    data: { winner_id: winnerId, reward_type: out.reward_type },
    email: true,
  }).catch(() => {});
  return { rewardType: out.reward_type, status: isMaterial ? 'received' : 'distributed' };
}

/**
 * Notifies all not-yet-notified winners of a season and stamps them.
 * @param {string} seasonId
 * @returns {Promise<{ notified: number }>}
 * @throws {ApiError} 404 when the season does not exist.
 */
export async function notifyWinners(seasonId) {
  const season = await db.LeaderboardSeason.findByPk(seasonId, { attributes: ['id', 'name'], raw: true });
  if (!season) throw ApiError.notFound('NOT_FOUND');
  const winners = await db.SeasonWinner.findAll({ where: { season_id: seasonId, notified_winner_at: null } });
  let notified = 0;
  for (const w of winners) {
    await notifyUser({
      userId: w.user_id,
      type: 'season_winner_announced',
      title: 'Félicitations, vous êtes dans le classement !',
      message: `Vous êtes #${w.rank_position} de la saison ${season.name ?? ''}. L'admin vous enverra votre récompense bientôt.`,
      data: { winner_id: w.id, season_id: seasonId, rank: w.rank_position },
      email: true,
    }).catch(() => {});
    w.notified_winner_at = new Date();
    await w.save();
    notified += 1;
  }
  return { notified };
}

/**
 * Lets a winner confirm they physically received their reward (owner-scoped).
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when not found for this user.
 */
export async function markRewardReceived(id, userId) {
  const winner = await db.SeasonWinner.findOne({ where: { id, user_id: userId } });
  if (!winner) throw ApiError.notFound('NOT_FOUND');
  winner.reward_status = 'received';
  winner.received_at = new Date();
  await winner.save();
  return winner;
}

/**
 * All-time artist leaderboard: score = total vote credits received + total gift
 * value received. Replaces the frontend's client-side aggregation.
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ id, name, avatar_url, score }>>}
 */
export async function getAllTimeArtists(limit = 50) {
  return db.sequelize.query(
    `SELECT p.id,
            COALESCE(NULLIF(p.full_name,''), NULLIF(ap.stage_name,''), SUBSTRING_INDEX(p.email,'@',1)) AS name,
            p.avatar_url,
            (COALESCE(v.votes,0) + COALESCE(g.gifts_value,0)) AS score
       FROM artist_profiles ap
       JOIN profiles p ON p.id = ap.user_id
       LEFT JOIN (SELECT artist_id, SUM(amount) AS votes FROM duel_votes GROUP BY artist_id) v ON v.artist_id = p.id
       LEFT JOIN (SELECT gt.to_user_id, SUM(vg.price) AS gifts_value
                    FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
                   GROUP BY gt.to_user_id) g ON g.to_user_id = p.id
      ORDER BY score DESC
      LIMIT :limit`,
    { replacements: { limit: Math.min(Number(limit) || 50, 100) }, type: QueryTypes.SELECT },
  );
}

/**
 * All-time donor (fan) leaderboard: score = total gift value sent + total vote
 * credits spent.
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ id, name, avatar_url, score }>>}
 */
export async function getAllTimeDonors(limit = 50) {
  return db.sequelize.query(
    `SELECT p.id,
            COALESCE(NULLIF(p.full_name,''), NULLIF(ap.stage_name,''), SUBSTRING_INDEX(p.email,'@',1)) AS name,
            p.avatar_url,
            (COALESCE(gv.given,0) + COALESCE(vv.given,0)) AS score
       FROM profiles p
       LEFT JOIN artist_profiles ap ON ap.user_id = p.id
       LEFT JOIN (SELECT gt.from_user_id, SUM(vg.price) AS given
                    FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
                   GROUP BY gt.from_user_id) gv ON gv.from_user_id = p.id
       LEFT JOIN (SELECT user_id, SUM(amount) AS given FROM duel_votes GROUP BY user_id) vv ON vv.user_id = p.id
      WHERE (gv.given IS NOT NULL OR vv.given IS NOT NULL)
      ORDER BY score DESC
      LIMIT :limit`,
    { replacements: { limit: Math.min(Number(limit) || 50, 100) }, type: QueryTypes.SELECT },
  );
}

/**
 * All season winners across seasons (admin/history view), enriched with each
 * winner's public profile, ordered by rank.
 * @returns {Promise<object[]>}
 */
export async function getAllWinners() {
  const rows = await db.SeasonWinner.findAll({ order: [['rank_position', 'ASC']], raw: true });
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const profiles = ids.length
    ? await db.Profile.findAll({ where: { id: ids }, attributes: ['id', 'full_name', 'avatar_url'], raw: true })
    : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, user: byId.get(r.user_id) ?? null }));
}

/* -------------------------------------------------------------------------- */
/* Per-context gift/vote engagement leaderboard                               */
/* -------------------------------------------------------------------------- */

/** Max senders returned by the per-context engagement leaderboard. */
const GIFT_ENGAGEMENT_LIMIT = 20;

/**
 * Per-context SQL producing `{ user_id, total }` rows (sender → summed
 * engagement value) for a single event context. Each query aggregates only the
 * tables that carry a foreign key to that context:
 *  - **duel**: `duel_votes.amount` (by `user_id`) + `gift_transactions` gift
 *    value (by `from_user_id`), both keyed on `duel_id`.
 *  - **competition**: `competition_gifts.credits` (by `sender_id`) +
 *    `competition_votes.credits_spent` (by `voter_id`), keyed on `competition_id`.
 *  - **live**: `gift_transactions` gift value (by `from_user_id`), keyed on `live_id`.
 *  - **concert**: `concert_dedications.price_credits` (by `fan_id`), keyed on
 *    `concert_id`. `gift_transactions` has no `concert_id` column, so dedications
 *    are the only concert-attributable spend.
 */
const GIFT_ENGAGEMENT_SQL = {
  duel: `
    SELECT uid AS user_id, ROUND(SUM(amt), 2) AS total FROM (
      SELECT user_id AS uid, amount AS amt FROM duel_votes WHERE duel_id = :ctx
      UNION ALL
      SELECT gt.from_user_id AS uid, COALESCE(vg.price, 0) AS amt
        FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
       WHERE gt.duel_id = :ctx
    ) x
    GROUP BY uid ORDER BY total DESC LIMIT :limit`,
  competition: `
    SELECT uid AS user_id, ROUND(SUM(amt), 2) AS total FROM (
      SELECT sender_id AS uid, credits AS amt FROM competition_gifts WHERE competition_id = :ctx
      UNION ALL
      SELECT voter_id AS uid, credits_spent AS amt FROM competition_votes WHERE competition_id = :ctx
    ) x
    GROUP BY uid ORDER BY total DESC LIMIT :limit`,
  live: `
    SELECT gt.from_user_id AS user_id, ROUND(SUM(COALESCE(vg.price, 0)), 2) AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
     WHERE gt.live_id = :ctx
     GROUP BY gt.from_user_id ORDER BY total DESC LIMIT :limit`,
  concert: `
    SELECT fan_id AS user_id, ROUND(SUM(price_credits), 2) AS total
      FROM concert_dedications WHERE concert_id = :ctx
     GROUP BY fan_id ORDER BY total DESC LIMIT :limit`,
};

/**
 * Top engagement senders for one event context, replacing the frontend's former
 * client-side aggregation of `competition_gifts`, `competition_votes`,
 * `gift_transactions` and `duel_votes`. Rows are enriched with each sender's
 * display profile (name/avatar, visibility-preference respecting).
 * @param {{ contextType: 'duel'|'concert'|'live'|'competition', contextId: string }} params
 * @returns {Promise<Array<{ user_id: string, total: number, full_name: string|null, avatar_url: string|null }>>}
 */
export async function getGiftEngagement({ contextType, contextId }) {
  const sql = GIFT_ENGAGEMENT_SQL[contextType];
  if (!sql) throw ApiError.badRequest('BAD_REQUEST', { details: { contextType } });
  const rows = await db.sequelize.query(sql, {
    replacements: { ctx: contextId, limit: GIFT_ENGAGEMENT_LIMIT },
    type: QueryTypes.SELECT,
  });
  const profiles = await getDisplayProfiles(rows.map((r) => r.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({
    user_id: r.user_id,
    total: Number(r.total) || 0,
    full_name: byId.get(r.user_id)?.full_name ?? null,
    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
  }));
}

export default {
  getSeasonLeaderboard,
  getGiftEngagement,
  getAllTimeArtists,
  getAllTimeDonors,
  getAllWinners,
  listSeasons,
  getSeason,
  createSeason,
  updateSeason,
  deleteSeason,
  addReward,
  updateReward,
  deleteReward,
  listSeasonWinners,
  createSeasonWinner,
  updateWinner,
  respondToMeeting,
  distributeReward,
  notifyWinners,
  markRewardReceived,
};
