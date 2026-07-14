import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));

import { db } from '../src/models/index.js';
import * as admin from '../src/services/admin.service.js';
import * as sponsor from '../src/services/sponsor.service.js';

/**
 * @file Lots 3+4 tests — admin analytics reads + sponsor-admin. Date-window
 * variants (`get_credit_purchase_stats`, period filters) use MySQL date
 * functions and are validated against real MySQL; here we exercise the
 * SQLite-compatible paths (period='all', joins, writes).
 */

const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ARTIST = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
const MANAGER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac';
let distId;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: ADMIN, email: 'ad@x.co', full_name: 'Admin' },
    { id: ARTIST, email: 'ar@x.co', full_name: 'Artist One' },
    { id: MANAGER, email: 'mg@x.co', full_name: 'Manager One' },
  ]);
  await db.UserRole.bulkCreate([
    { user_id: ARTIST, role: 'artist' },
    { user_id: MANAGER, role: 'manager' },
  ]);
  const d = await db.RevenueDistribution.create({
    payer_id: 'p1', source_id: 's1', source_type: 'duel', total_credits: 100,
    artist1_id: ARTIST, artist1_credits: 60, manager_id: MANAGER, manager_credits: 20, platform_credits: 20,
  });
  distId = d.id;
  await db.RevenueDistribution.create({
    payer_id: 'p2', source_id: 's2', source_type: 'concert', total_credits: 50,
    artist1_id: ARTIST, artist1_credits: 30, platform_credits: 20,
  });
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(() => vi.clearAllMocks());

describe('admin analytics', () => {
  it('getRevenueStats groups by source type (period=all)', async () => {
    const rows = await admin.getRevenueStats('all');
    const byType = Object.fromEntries(rows.map((r) => [r.source_type, r]));
    expect(Number(byType.duel.total_credits)).toBe(100);
    expect(Number(byType.duel.artists_credits)).toBe(60);
    expect(Number(byType.concert.total_credits)).toBe(50);
  });

  it('getTopEarners ranks artists + managers with role (period=all)', async () => {
    const rows = await admin.getTopEarners('all', 10);
    const artist = rows.find((r) => r.user_id === ARTIST);
    expect(Number(artist.total_credits)).toBe(90); // 60 + 30
    expect(artist.role).toBe('artist');
    const manager = rows.find((r) => r.user_id === MANAGER);
    expect(manager.role).toBe('manager');
  });

  it('compareDistribution returns actual split + percentages', async () => {
    const res = await admin.compareDistribution(distId);
    expect(res.total_credits).toBe(100);
    expect(res.actual).toEqual({ platform: 20, artists: 60, manager: 20 });
    expect(res.actual_pct.artists).toBe(60);
  });

  it('compareDistribution 404s an unknown id', async () => {
    await expect(admin.compareDistribution('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('broadcastAnnouncement notifies every user', async () => {
    const res = await admin.broadcastAnnouncement({ title: 'Hello', message: 'World', adminId: ADMIN, adminName: 'Admin' });
    expect(res.recipients).toBe(3);
    expect(await db.Notification.count({ where: { type: 'announcement' } })).toBe(3);
  });
});

describe('sponsor-admin', () => {
  let requestId;
  beforeAll(async () => {
    await db.SponsorPriceTier.create({ label: 'S', min_seconds: 0, max_seconds: 30, price_credits: 150, is_active: true });
    const req = await db.SponsorRequest.create({
      requester_id: ARTIST, event_id: 'e1', event_type: 'duel', media_type: 'video',
      media_url: 'https://cdn/a.mp4', media_duration_seconds: 20, description: 'Brand', price_credits: 0, status: 'pending',
    });
    requestId = req.id;
  });

  it('defaultPrice returns the tier price, or null when none matches', async () => {
    expect((await sponsor.defaultPrice(20)).priceCredits).toBe(150);
    expect((await sponsor.defaultPrice(9999)).priceCredits).toBeNull();
  });

  it('setRequestPrice moves the request to awaiting_payment', async () => {
    const row = await sponsor.setRequestPrice({ id: requestId, priceCredits: 250, adminId: ADMIN });
    expect(row.status).toBe('awaiting_payment');
    expect(Number(row.price_credits)).toBe(250);
  });

  it('approveReuseMedia approves and registers an ad video', async () => {
    const req = await db.SponsorRequest.create({
      requester_id: ARTIST, event_id: 'e2', event_type: 'duel', media_type: 'video',
      media_url: 'x', media_duration_seconds: 10, description: 'Reused', price_credits: 100, status: 'pending',
    });
    const row = await sponsor.approveReuseMedia({ id: req.id, mediaUrl: 'https://cdn/reused.mp4', durationSeconds: 15, adminId: ADMIN });
    expect(row.status).toBe('approved');
    const ad = await db.SponsorAdVideo.findOne({ where: { event_id: 'e2', video_url: 'https://cdn/reused.mp4' } });
    expect(ad).toBeTruthy();
  });

  it('listAdHistory returns plays with ad title + triggerer name', async () => {
    const ad = await db.SponsorAdVideo.create({ event_id: 'e3', event_type: 'duel', title: 'Spot', video_url: 'u', duration_seconds: 15, is_active: true, play_count: 0 });
    await db.SponsorAdPlay.create({ ad_video_id: ad.id, event_id: 'e3', event_type: 'duel', triggered_by: ARTIST, duration_seconds: 15, played_at: new Date() });
    const rows = await sponsor.listAdHistory('e3', 'duel');
    expect(rows).toHaveLength(1);
    expect(rows[0].ad_title).toBe('Spot');
    expect(rows[0].triggered_by_name).toBe('Artist One');
  });
});
