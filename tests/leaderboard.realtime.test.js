import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/redis.js', () => ({ getRedis: vi.fn(), createQueueConnection: vi.fn(), default: vi.fn() }));
vi.mock('../src/services/leaderboard.service.js', () => ({ getSeasonLeaderboard: vi.fn() }));

import { getRedis } from '../src/config/redis.js';
import { db } from '../src/models/index.js';
import { getSeasonLeaderboard } from '../src/services/leaderboard.service.js';
import * as rt from '../src/services/leaderboard.realtime.js';

/**
 * @file Real-time (Redis ZSET) leaderboard tests. Uses an in-memory fake ZSET
 * and a mocked SQL leaderboard so the increment weights, top-N read, cold-cache
 * rebuild, and Redis-down fallback are all verified deterministically.
 */

/** Minimal in-memory ioredis ZSET stub (only the methods we use). */
class FakeRedis {
  constructor() { this.sets = new Map(); }
  _set(k) { if (!this.sets.has(k)) this.sets.set(k, new Map()); return this.sets.get(k); }
  async zincrby(k, delta, member) { const s = this._set(k); s.set(member, (s.get(member) || 0) + Number(delta)); return String(s.get(member)); }
  async zadd(k, ...args) { const s = this._set(k); for (let i = 0; i < args.length; i += 2) s.set(args[i + 1], Number(args[i])); return args.length / 2; }
  async zcard(k) { return this.sets.has(k) ? this.sets.get(k).size : 0; }
  async zrevrange(k, start, stop, withScores) {
    const s = this._set(k);
    const sorted = [...s.entries()].sort((a, b) => b[1] - a[1]).slice(start, stop + 1);
    return withScores ? sorted.flatMap(([m, sc]) => [m, String(sc)]) : sorted.map(([m]) => m);
  }
  async expire() { return 1; }
}

const ARTIST_SEASON = 'aaaaaaaa-0000-0000-0000-000000000001';
const DONOR_SEASON = 'bbbbbbbb-0000-0000-0000-000000000002';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  const now = new Date();
  const start = new Date(now.getTime() - 86_400_000);
  const end = new Date(now.getTime() + 86_400_000);
  await db.LeaderboardSeason.bulkCreate([
    { id: ARTIST_SEASON, name: 'Artists', type: 'artist', start_date: start, end_date: end, is_active: true },
    { id: DONOR_SEASON, name: 'Donors', type: 'donor', start_date: start, end_date: end, is_active: true },
  ]);
  await db.Profile.bulkCreate([
    { id: 'artist-1', email: 'a1@x.co', full_name: 'Artist One' },
    { id: 'donor-1', email: 'd1@x.co', full_name: 'Donor One' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(() => {
  vi.mocked(getRedis).mockReset();
  vi.mocked(getSeasonLeaderboard).mockReset();
  rt.invalidateActiveSeasons();
});

describe('recordVote / recordGift (ZSET increments)', () => {
  it('applies weighted vote points to artist + donor leaderboards', async () => {
    const fake = new FakeRedis();
    vi.mocked(getRedis).mockReturnValue(fake);
    await rt.recordVote({ artistId: 'artist-1', donorId: 'donor-1', amount: 5 });
    expect(await fake.zcard(`lb:artist:${ARTIST_SEASON}`)).toBe(1);
    expect(Number(await fake.zincrby(`lb:artist:${ARTIST_SEASON}`, 0, 'artist-1'))).toBe(50); // 5*10
    expect(Number(await fake.zincrby(`lb:donor:${DONOR_SEASON}`, 0, 'donor-1'))).toBe(5); // 5*1
  });

  it('applies weighted gift value to artist + donor leaderboards', async () => {
    const fake = new FakeRedis();
    vi.mocked(getRedis).mockReturnValue(fake);
    await rt.recordGift({ receiverId: 'artist-1', senderId: 'donor-1', value: 20 });
    expect(Number(await fake.zincrby(`lb:artist:${ARTIST_SEASON}`, 0, 'artist-1'))).toBe(100); // 20*5
    expect(Number(await fake.zincrby(`lb:donor:${DONOR_SEASON}`, 0, 'donor-1'))).toBe(20);
  });

  it('is a no-op when Redis is unavailable', async () => {
    vi.mocked(getRedis).mockReturnValue(null);
    await expect(rt.recordVote({ artistId: 'artist-1', donorId: 'donor-1', amount: 5 })).resolves.toBeUndefined();
  });
});

describe('topN', () => {
  it('reads and ranks from the ZSET (warm cache)', async () => {
    const fake = new FakeRedis();
    await fake.zadd(`lb:artist:${ARTIST_SEASON}`, 30, 'artist-1', 90, 'x', 10, 'y');
    vi.mocked(getRedis).mockReturnValue(fake);

    const { source, rows } = await rt.topN(ARTIST_SEASON, 10);
    expect(source).toBe('redis');
    expect(rows.map((r) => r.user_id)).toEqual(['x', 'artist-1', 'y']);
    expect(rows[0]).toMatchObject({ score: 90, rank_position: 1 });
    expect(rows[1]).toMatchObject({ user_id: 'artist-1', full_name: 'Artist One', rank_position: 2 });
  });

  it('rebuilds a cold ZSET from the SQL leaderboard', async () => {
    const fake = new FakeRedis();
    vi.mocked(getRedis).mockReturnValue(fake);
    vi.mocked(getSeasonLeaderboard).mockResolvedValue([
      { user_id: 'artist-1', full_name: 'Artist One', avatar_url: null, score: 42 },
    ]);
    const { source, rows } = await rt.topN(ARTIST_SEASON, 10);
    expect(source).toBe('redis');
    expect(rows[0]).toMatchObject({ user_id: 'artist-1', score: 42, rank_position: 1 });
    expect(await fake.zcard(`lb:artist:${ARTIST_SEASON}`)).toBe(1); // populated
    expect(getSeasonLeaderboard).toHaveBeenCalled();
  });

  it('falls back to SQL when Redis is down', async () => {
    vi.mocked(getRedis).mockReturnValue(null);
    vi.mocked(getSeasonLeaderboard).mockResolvedValue([
      { user_id: 'donor-1', full_name: 'Donor One', avatar_url: null, score: 7 },
    ]);
    const { source, rows } = await rt.topN(DONOR_SEASON, 10);
    expect(source).toBe('sql');
    expect(rows[0]).toMatchObject({ user_id: 'donor-1', score: 7, rank_position: 1 });
  });

  it('returns empty for an unknown season', async () => {
    vi.mocked(getRedis).mockReturnValue(new FakeRedis());
    const { rows } = await rt.topN('00000000-0000-0000-0000-000000000000', 10);
    expect(rows).toEqual([]);
  });
});
