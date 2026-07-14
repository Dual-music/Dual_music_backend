import { Op } from 'sequelize';

import { logger } from '../config/logger.js';
import { getRedis } from '../config/redis.js';
import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';

import { getSeasonLeaderboard } from './leaderboard.service.js';
import { getDisplayProfiles } from './user.service.js';

/**
 * @file Real-time leaderboards backed by Redis **sorted sets (ZSET)**.
 *
 * Each active season has a ZSET (`lb:<type>:<seasonId>`, member = userId,
 * score = points) that is incremented as votes/gifts happen — giving O(log n)
 * writes and instant top-N reads, instead of recomputing the SQL aggregation
 * each time. Scoring mirrors `get_season_leaderboard`:
 *   - **artist** season: `votes*10 + gifts_received_value*5 + wins*50`
 *   - **donor**  season: `gifts_sent_value + votes_cast`
 *
 * Cold cache or Redis-down degrades gracefully: `topN` rebuilds the ZSET from
 * the SQL leaderboard (cache-aside), and every write is best-effort (never
 * breaks the financial operation). A `leaderboard:update` event is broadcast to
 * the season room so clients can live-refresh.
 *
 * @module services/leaderboard.realtime
 */

const KEY = (type, seasonId) => `lb:${type}:${seasonId}`;
const TTL_SECONDS = 7 * 24 * 60 * 60; // safety expiry; rebuilt on demand
const SCORE = { VOTE_ARTIST: 10, GIFT_ARTIST: 5, WIN_ARTIST: 50 }; // donor weights are 1:1

/** In-process cache of active seasons (avoids a DB hit per vote/gift). */
let activeCache = { at: 0, seasons: [] };

/**
 * Returns the currently-active seasons (is_active + now within window),
 * cached for 60s.
 * @returns {Promise<Array<{ id: string, type: string }>>}
 */
async function activeSeasons() {
  const now = Date.now();
  if (now - activeCache.at < 60_000) return activeCache.seasons;
  const rows = await db.LeaderboardSeason.findAll({
    where: { is_active: true, start_date: { [Op.lte]: new Date() }, end_date: { [Op.gte]: new Date() } },
    attributes: ['id', 'type'],
    raw: true,
  }).catch(() => []);
  activeCache = { at: now, seasons: rows };
  return rows;
}

/** Applies a delta to a member of a season's ZSET and broadcasts the change. */
async function bump(redis, type, seasonId, userId, delta) {
  if (!delta) return;
  const key = KEY(type, seasonId);
  await redis.zincrby(key, delta, userId);
  await redis.expire(key, TTL_SECONDS);
  emitToRoom('/live', roomName('leaderboard', seasonId), 'leaderboard:update', { season_id: seasonId, type, user_id: userId });
}

/**
 * Records a paid vote's contribution to the active leaderboards.
 * @param {object} params
 * @param {string} params.artistId - Vote recipient (artist season).
 * @param {string} params.donorId  - Voter (donor season).
 * @param {number} params.amount   - Credits spent.
 * @returns {Promise<void>} Best-effort; never throws.
 */
export async function recordVote({ artistId, donorId, amount }) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const seasons = await activeSeasons();
    for (const s of seasons) {
      if (s.type === 'artist') await bump(redis, 'artist', s.id, artistId, amount * SCORE.VOTE_ARTIST);
      else await bump(redis, 'donor', s.id, donorId, amount);
    }
  } catch (err) {
    logger.warn({ err: err?.message }, 'leaderboard recordVote failed');
  }
}

/**
 * Records a gift's contribution to the active leaderboards.
 * @param {object} params
 * @param {string} params.receiverId - Gift recipient (artist season).
 * @param {string} params.senderId   - Donor (donor season).
 * @param {number} params.value      - Gift credit value.
 * @returns {Promise<void>} Best-effort; never throws.
 */
export async function recordGift({ receiverId, senderId, value }) {
  const redis = getRedis();
  if (!redis || !value) return;
  try {
    const seasons = await activeSeasons();
    for (const s of seasons) {
      if (s.type === 'artist') await bump(redis, 'artist', s.id, receiverId, value * SCORE.GIFT_ARTIST);
      else await bump(redis, 'donor', s.id, senderId, value);
    }
  } catch (err) {
    logger.warn({ err: err?.message }, 'leaderboard recordGift failed');
  }
}

/**
 * Records a duel win (+points) to active artist leaderboards.
 * @param {string} winnerId
 * @returns {Promise<void>} Best-effort.
 */
export async function recordWin(winnerId) {
  const redis = getRedis();
  if (!redis || !winnerId) return;
  try {
    const seasons = await activeSeasons();
    for (const s of seasons) {
      if (s.type === 'artist') await bump(redis, 'artist', s.id, winnerId, SCORE.WIN_ARTIST);
    }
  } catch (err) {
    logger.warn({ err: err?.message }, 'leaderboard recordWin failed');
  }
}

/** Hydrates ZSET rows (member+score) with display profiles. */
async function hydrate(entries) {
  const profiles = await getDisplayProfiles(entries.map((e) => e.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return entries.map((e, i) => ({
    user_id: e.user_id,
    full_name: byId.get(e.user_id)?.full_name ?? null,
    avatar_url: byId.get(e.user_id)?.avatar_url ?? null,
    score: e.score,
    rank_position: i + 1,
  }));
}

/**
 * Returns the real-time top-N for a season from Redis, rebuilding the ZSET from
 * the SQL leaderboard on a cold cache. Falls back to the SQL leaderboard when
 * Redis is unavailable.
 *
 * @param {string} seasonId
 * @param {number} [limit=50]
 * @returns {Promise<{ source: 'redis'|'sql', rows: object[] }>}
 */
export async function topN(seasonId, limit = 50) {
  const redis = getRedis();
  const season = await db.LeaderboardSeason.findByPk(seasonId, { attributes: ['id', 'type'], raw: true });
  if (!season) return { source: 'sql', rows: [] };
  const type = season.type === 'artist' ? 'artist' : 'donor';

  if (!redis) {
    // No Redis → SQL leaderboard, mapped to the compact realtime shape.
    const rows = await getSeasonLeaderboard(seasonId, limit);
    return { source: 'sql', rows: rows.map((r, i) => ({ user_id: r.user_id, full_name: r.full_name, avatar_url: r.avatar_url, score: Number(r.score), rank_position: i + 1 })) };
  }

  const key = KEY(type, seasonId);
  let count = 0;
  try {
    count = await redis.zcard(key);
  } catch {
    count = 0;
  }

  if (count === 0) {
    // Cold cache: rebuild the ZSET from the authoritative SQL leaderboard.
    const rows = await getSeasonLeaderboard(seasonId, 500);
    if (rows.length) {
      const args = [];
      for (const r of rows) args.push(Number(r.score), r.user_id);
      await redis.zadd(key, ...args).catch(() => {});
      await redis.expire(key, TTL_SECONDS).catch(() => {});
    }
    return { source: 'redis', rows: await hydrate(rows.slice(0, limit).map((r) => ({ user_id: r.user_id, score: Number(r.score) }))) };
  }

  const flat = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
  const entries = [];
  for (let i = 0; i < flat.length; i += 2) entries.push({ user_id: flat[i], score: Number(flat[i + 1]) });
  return { source: 'redis', rows: await hydrate(entries) };
}

/** Invalidates the active-seasons cache (e.g. after a season CRUD change). */
export function invalidateActiveSeasons() {
  activeCache = { at: 0, seasons: [] };
}

export default { recordVote, recordGift, recordWin, topN, invalidateActiveSeasons };
