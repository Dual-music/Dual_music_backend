import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));

import { db } from '../src/models/index.js';
import * as concert from '../src/services/concert.service.js';
import * as leaderboard from '../src/services/leaderboard.service.js';
import { callProcedure } from '../src/utils/procedures.js';

/**
 * @file Lots 2+5 tests — concert dedications (validation + procedure mapping)
 * and season reward distribution / winner notification.
 */

const FAN = 'ded00000-0000-0000-0000-000000000001';
const ARTIST = 'ded00000-0000-0000-0000-000000000002';
let concertId;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.PlatformSetting.create({ key: 'economic_config', value: { dedication: { min_price_credits: 10, platform_pct: 20 } } });
  const c = await db.ArtistConcert.create({
    artist_id: ARTIST, title: 'Show', scheduled_date: new Date(), ticket_price: 0, status: 'published',
    approval_status: 'approved', allows_dedications: true, allows_sponsor_ads: false,
  });
  concertId = c.id;
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(() => vi.mocked(callProcedure).mockReset());

describe('concert dedications', () => {
  const base = () => ({ concertId, concertType: 'artist_concert', message: 'Joyeux anniversaire !', priceCredits: 50 });

  it('purchases a dedication via the atomic procedure', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', dedication_id: 'ded-1' });
    const res = await concert.purchaseDedication(FAN, base());
    expect(res).toEqual({ dedicationId: 'ded-1' });
    expect(callProcedure).toHaveBeenCalledWith(
      'purchase_concert_dedication_from_wallet',
      expect.arrayContaining([FAN, concertId, 'artist_concert', ARTIST]),
      ['success', 'code', 'dedication_id'],
    );
  });

  it('rejects a too-short message', async () => {
    await expect(concert.purchaseDedication(FAN, { ...base(), message: 'hi' })).rejects.toMatchObject({ code: 'DEDICATION_MESSAGE_REQUIRED' });
  });

  it('rejects a price below the minimum', async () => {
    await expect(concert.purchaseDedication(FAN, { ...base(), priceCredits: 5 })).rejects.toMatchObject({ code: 'DEDICATION_PRICE_BELOW_MIN' });
  });

  it('404s an unknown event', async () => {
    await expect(concert.purchaseDedication(FAN, { ...base(), concertId: '00000000-0000-0000-0000-000000000000' })).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });

  it('rejects when dedications are disabled', async () => {
    const c = await db.ArtistConcert.create({ artist_id: ARTIST, title: 'No', scheduled_date: new Date(), ticket_price: 0, status: 'published', approval_status: 'approved', allows_dedications: false, allows_sponsor_ads: false });
    await expect(concert.purchaseDedication(FAN, { ...base(), concertId: c.id })).rejects.toMatchObject({ code: 'DEDICATIONS_DISABLED' });
  });

  it('maps insufficient balance from the procedure', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'insufficient_balance' });
    await expect(concert.purchaseDedication(FAN, base())).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT' });
  });

  it('delivers a paid dedication (artist), rejects wrong state / non-owner', async () => {
    const d = await db.ConcertDedication.create({ concert_id: concertId, concert_type: 'artist_concert', artist_id: ARTIST, fan_id: FAN, message: 'x', price_credits: 50, status: 'paid', paid_at: new Date() });
    const delivered = await concert.deliverDedication(d.id, ARTIST, []);
    expect(delivered.status).toBe('delivered');
    await expect(concert.deliverDedication(d.id, ARTIST, [])).rejects.toMatchObject({ code: 'DEDICATION_NOT_PENDING' });

    const d2 = await db.ConcertDedication.create({ concert_id: concertId, concert_type: 'artist_concert', artist_id: ARTIST, fan_id: FAN, message: 'y', price_credits: 50, status: 'paid', paid_at: new Date() });
    await expect(concert.deliverDedication(d2.id, 'someone-else', ['fan'])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('season rewards', () => {
  const SEASON = 'sea00000-0000-0000-0000-000000000001';
  beforeAll(async () => {
    await db.LeaderboardSeason.create({ id: SEASON, name: 'S1', type: 'artist', start_date: new Date(Date.now() - 1e7), end_date: new Date(Date.now() + 1e7), is_active: true });
  });

  it('distributes a reward via the procedure and reports received', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', reward_type: 'credits', user_id: ARTIST });
    const res = await leaderboard.distributeReward('winner-1');
    expect(res).toEqual({ rewardType: 'credits', status: 'received' });
  });

  it('maps no_reward_defined', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'no_reward_defined' });
    await expect(leaderboard.distributeReward('winner-1')).rejects.toMatchObject({ code: 'REWARD_NOT_DEFINED' });
  });

  it('notifies not-yet-notified winners and stamps them', async () => {
    await db.SeasonWinner.bulkCreate([
      { season_id: SEASON, user_id: ARTIST, rank_position: 1, reward_status: 'pending', meeting_status: 'none' },
      { season_id: SEASON, user_id: FAN, rank_position: 2, reward_status: 'pending', meeting_status: 'none', notified_winner_at: new Date() },
    ]);
    const res = await leaderboard.notifyWinners(SEASON);
    expect(res.notified).toBe(1); // only the un-notified one
    expect(await db.SeasonWinner.count({ where: { season_id: SEASON, notified_winner_at: null } })).toBe(0);
  });

  it('lets a winner mark their reward received', async () => {
    const w = await db.SeasonWinner.create({ season_id: SEASON, user_id: FAN, rank_position: 3, reward_status: 'distributed', meeting_status: 'none' });
    const updated = await leaderboard.markRewardReceived(w.id, FAN);
    expect(updated.reward_status).toBe('received');
    await expect(leaderboard.markRewardReceived(w.id, 'not-the-winner')).rejects.toMatchObject({ statusCode: 404 });
  });
});
