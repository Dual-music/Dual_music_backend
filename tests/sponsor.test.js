import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));

import { db } from '../src/models/index.js';
import * as sponsors from '../src/services/sponsor.service.js';
import { callProcedure } from '../src/utils/procedures.js';

/**
 * @file Sponsor service tests: price-tier grid, request creation (deadline +
 * pricing), atomic payment mapping, admin review (ad-video registration) and
 * the live ad broadcast lifecycle.
 */

const REQUESTER = '66666666-6666-6666-6666-666666666666';
let duelId;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.SponsorPriceTier.create({ label: 'Spot 0-30s', min_seconds: 0, max_seconds: 30, price_credits: 200, is_active: true });
  const duel = await db.Duel.create({ artist1_id: 'a1', artist2_id: 'a2', ticket_price: 0, allows_sponsor_ads: true, status: 'upcoming' });
  duelId = duel.id;
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(() => vi.clearAllMocks());

describe('price tiers', () => {
  it('lists active tiers', async () => {
    const tiers = await sponsors.listTiers();
    expect(tiers).toHaveLength(1);
  });

  it('prices a duration from the grid', async () => {
    const { priceCredits } = await sponsors.priceForDuration(20);
    expect(priceCredits).toBe(200);
  });

  it('throws when no tier covers the duration', async () => {
    await expect(sponsors.priceForDuration(9999)).rejects.toMatchObject({ code: 'SPONSOR_NO_TIER' });
  });

  it('supports tier CRUD', async () => {
    const t = await sponsors.createTier({ label: 'Long', min_seconds: 31, max_seconds: 60, price_credits: 400 });
    const upd = await sponsors.updateTier(t.id, { price_credits: 450 });
    expect(Number(upd.price_credits)).toBe(450);
    expect(await sponsors.deleteTier(t.id)).toEqual({ removed: true });
  });
});

describe('createRequest', () => {
  it('creates a pending request priced from the grid (no description → empty)', async () => {
    const req = await sponsors.createRequest(REQUESTER, {
      eventType: 'duel',
      eventId: duelId,
      mediaType: 'video',
      mediaUrl: 'https://cdn/ad.mp4',
      mediaDurationSeconds: 20,
    });
    expect(req.status).toBe('pending');
    expect(Number(req.price_credits)).toBe(200);
    expect(req.description).toBe('');
  });

  it('rejects an unknown event type', async () => {
    await expect(
      sponsors.createRequest(REQUESTER, { eventType: 'gala', eventId: duelId, mediaType: 'video', mediaUrl: 'x', mediaDurationSeconds: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s an unknown event', async () => {
    await expect(
      sponsors.createRequest(REQUESTER, { eventType: 'duel', eventId: '00000000-0000-0000-0000-000000000000', mediaType: 'video', mediaUrl: 'x', mediaDurationSeconds: 10 }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });

  it('rejects when the submission deadline has passed', async () => {
    const past = await db.Duel.create({ artist1_id: 'a1', artist2_id: 'a2', ticket_price: 0, allows_sponsor_ads: true, sponsor_submission_deadline: new Date(Date.now() - 3600_000) });
    await expect(
      sponsors.createRequest(REQUESTER, { eventType: 'duel', eventId: past.id, mediaType: 'video', mediaUrl: 'x', mediaDurationSeconds: 10 }),
    ).rejects.toMatchObject({ code: 'SPONSOR_DEADLINE_PASSED' });
  });
});

describe('payRequest', () => {
  it('maps procedure failure to an insufficient-balance error', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'insufficient_balance' });
    await expect(sponsors.payRequest(REQUESTER, 'req-x')).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT' });
  });

  it('succeeds when the procedure reports ok', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok' });
    await expect(sponsors.payRequest(REQUESTER, 'req-x')).resolves.toEqual({ paid: true, code: 'ok' });
  });
});

describe('reviewRequest', () => {
  async function seed() {
    return db.SponsorRequest.create({
      requester_id: REQUESTER,
      event_id: duelId,
      event_type: 'duel',
      media_type: 'video',
      media_url: 'https://cdn/ad.mp4',
      media_duration_seconds: 20,
      description: 'My Brand',
      price_credits: 200,
      status: 'pending',
    });
  }

  it('approves and registers a playable ad video', async () => {
    const req = await seed();
    const res = await sponsors.reviewRequest({ id: req.id, reviewerId: 'admin', status: 'approved' });
    expect(res.status).toBe('approved');
    const ad = await db.SponsorAdVideo.findOne({ where: { event_id: duelId, title: 'My Brand' } });
    expect(ad).toBeTruthy();
  });

  it('rejects with a reason', async () => {
    const req = await seed();
    const res = await sponsors.reviewRequest({ id: req.id, reviewerId: 'admin', status: 'rejected', rejectedReason: 'off-brand' });
    expect(res.status).toBe('rejected');
    expect(res.rejected_reason).toBe('off-brand');
  });
});

describe('live ad broadcast', () => {
  let adId;
  beforeAll(async () => {
    const ad = await db.SponsorAdVideo.create({ event_id: duelId, event_type: 'duel', title: 'Ad', video_url: 'https://cdn/a.mp4', duration_seconds: 15, is_active: true, play_count: 0 });
    adId = ad.id;
  });

  it('starts an ad, records a play and bumps play_count', async () => {
    const play = await sponsors.startAd({ eventId: duelId, eventType: 'duel', adVideoId: adId, triggeredBy: 'host' });
    expect(play.ad_video_id).toBe(adId);
    const ad = await db.SponsorAdVideo.findByPk(adId);
    expect(Number(ad.play_count)).toBe(1);
  });

  it('404s starting an unknown ad', async () => {
    await expect(sponsors.startAd({ eventId: duelId, eventType: 'duel', adVideoId: '00000000-0000-0000-0000-000000000000', triggeredBy: 'host' })).rejects.toMatchObject({ code: 'AD_NOT_FOUND' });
  });

  it('stops an in-progress ad', async () => {
    const play = await sponsors.startAd({ eventId: duelId, eventType: 'duel', adVideoId: adId, triggeredBy: 'host' });
    const stopped = await sponsors.stopAd(play.id);
    expect(stopped.ended_at).toBeTruthy();
  });

  it('lists active ad videos', async () => {
    const list = await sponsors.listAdVideos(duelId, 'duel');
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
