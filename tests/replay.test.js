import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/models/index.js';
import * as replays from '../src/services/replay.service.js';

/**
 * @file Replay service tests: recording persistence, access rules
 * (public/owner/unlocked premium), likes toggle, view counter, and owner/staff
 * authorization on edit/delete.
 */

const HOST = '77777777-7777-7777-7777-777777777771';
const VIEWER = '77777777-7777-7777-7777-777777777772';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: HOST, email: 'h@x.co', full_name: 'Host' },
    { id: VIEWER, email: 'v@x.co', full_name: 'Viewer' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('createReplay', () => {
  it('persists a public recording with defaults', async () => {
    const r = await replays.createReplay(HOST, {
      sourceType: 'duel',
      eventId: 'duel-1',
      title: 'Epic Duel',
      videoUrl: 'https://cdn/replay.mp4',
      duration: 120,
    });
    expect(r.source_type).toBe('duel');
    expect(r.duel_id).toBe('duel-1');
    expect(r.is_public).toBe(true);
    expect(r.is_premium).toBe(false);
    expect(r.created_by).toBe(HOST);
    expect(r.artist_id).toBe(HOST);
  });

  it('rejects an unknown source type', async () => {
    await expect(
      replays.createReplay(HOST, { sourceType: 'gala', eventId: 'x', title: 't', videoUrl: 'u' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('access rules', () => {
  let freeId;
  let premiumId;
  beforeAll(async () => {
    const free = await replays.createReplay(HOST, { sourceType: 'concert', eventId: 'c1', title: 'Free', videoUrl: 'u', isPremium: false });
    const premium = await replays.createReplay(HOST, { sourceType: 'concert', eventId: 'c2', title: 'Prem', videoUrl: 'u', isPremium: true, replayPrice: 100 });
    freeId = free.id;
    premiumId = premium.id;
  });

  it('grants access to a non-premium replay for anyone', async () => {
    expect((await replays.checkAccess(freeId, null)).hasAccess).toBe(true);
  });

  it('denies a premium replay to a non-owner without access', async () => {
    expect((await replays.checkAccess(premiumId, VIEWER)).hasAccess).toBe(false);
  });

  it('grants a premium replay to its owner', async () => {
    expect((await replays.checkAccess(premiumId, HOST)).hasAccess).toBe(true);
  });

  it('grants a premium replay once an access row exists', async () => {
    await db.ReplayAccess.create({ replay_id: premiumId, user_id: VIEWER, unlocked_at: new Date() });
    expect((await replays.checkAccess(premiumId, VIEWER)).hasAccess).toBe(true);
    const detail = await replays.getReplay(premiumId, VIEWER);
    expect(detail.hasAccess).toBe(true);
  });

  it('404s access for an unknown replay', async () => {
    await expect(replays.checkAccess('00000000-0000-0000-0000-000000000000', VIEWER)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('likes + views', () => {
  let id;
  beforeAll(async () => {
    const r = await replays.createReplay(HOST, { sourceType: 'duel', eventId: 'd2', title: 'L', videoUrl: 'u' });
    id = r.id;
  });

  it('toggles a like on and off with an accurate count', async () => {
    const on = await replays.toggleLike(VIEWER, id);
    expect(on).toEqual({ liked: true, likes: 1 });
    const off = await replays.toggleLike(VIEWER, id);
    expect(off).toEqual({ liked: false, likes: 0 });
  });

  it('increments the view counter', async () => {
    const a = await replays.incrementViews(id);
    const b = await replays.incrementViews(id);
    expect(b.views).toBe(a.views + 1);
  });

  it('reflects like state in the detail view', async () => {
    await replays.toggleLike(VIEWER, id);
    const detail = await replays.getReplay(id, VIEWER);
    expect(detail.liked).toBe(true);
    expect(detail.likes).toBe(1);
  });
});

describe('edit authorization', () => {
  let id;
  beforeAll(async () => {
    const r = await replays.createReplay(HOST, { sourceType: 'competition', eventId: 'comp1', title: 'E', videoUrl: 'u' });
    id = r.id;
  });

  it('lets the owner update whitelisted fields', async () => {
    const upd = await replays.updateReplay(id, HOST, [], { is_public: false, replay_price: 50, hacker: true });
    expect(upd.is_public).toBe(false);
    expect(Number(upd.replay_price)).toBe(50);
    expect(upd.hacker).toBeUndefined();
  });

  it('forbids a non-owner non-staff user', async () => {
    await expect(replays.updateReplay(id, VIEWER, ['fan'], { is_public: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows an admin', async () => {
    const upd = await replays.updateReplay(id, VIEWER, ['admin'], { title: 'By Admin' });
    expect(upd.title).toBe('By Admin');
  });

  it('deletes as owner', async () => {
    expect(await replays.deleteReplay(id, HOST, [])).toEqual({ removed: true });
  });
});
