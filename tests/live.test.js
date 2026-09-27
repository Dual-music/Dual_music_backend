import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// This dev machine's local `.env` (loaded unconditionally by `dotenv/config`,
// regardless of NODE_ENV) has real SMTP + LiveKit/S3 credentials, so calling
// `notifyUser`/`startRecording`/`stopRecording` for real here would attempt
// real network I/O (slow and flaky — other suites observed 3-20s per email
// send). Stub them so this suite is fast and deterministic everywhere it runs
// (same pattern as tests/moderation.test.js and tests/competition.test.js).
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));
vi.mock('../src/services/recording.service.js', () => ({
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  default: {},
}));

import { db } from '../src/models/index.js';
import * as live from '../src/services/live.service.js';

/**
 * @file Live service tests: démarrage/fin de direct (`startLive`/`endLive`),
 * `updateLiveStatus` (y compris le contournement admin/modérateur utilisé par
 * l'auto-stop de la modération sur un live qu'il ne possède pas),
 * `updateLiveSettings`, les demandes de participation invité (créer/lister/
 * répondre/annuler — qui a le droit de répondre/annuler), le résumé des
 * signalements et les lectures (`listLives`, `getLive`, `getLiveTitlesByIds`).
 *
 * `incrementLikes` est délibérément NON testé : il exécute du SQL brut
 * MySQL-only (`INSERT ... ON DUPLICATE KEY UPDATE` + `UTC_TIMESTAMP()`, voir
 * la doc du modèle `LiveLike`), qui échoue sous SQLite avec une erreur de
 * syntaxe (`near "DUPLICATE"`, vérifié empiriquement) — même catégorie que les
 * procédures stockées MySQL-only, couvert par les tests conteneurisés en CI
 * (voir l'en-tête de `vitest.config.js`). `getLikes` (simple SELECT portable)
 * reste testé en seedant directement une ligne `LiveLike` via l'ORM.
 */

const ARTIST = '55555555-5555-5555-5555-555555555501';
const VIEWER = '55555555-5555-5555-5555-555555555502';
const VIEWER2 = '55555555-5555-5555-5555-555555555503';
const OUTSIDER = '55555555-5555-5555-5555-555555555504';
const MOD_ID = '55555555-5555-5555-5555-555555555505';
const ADMIN_ID = '55555555-5555-5555-5555-555555555506';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: ARTIST, email: 'artist@x.co', full_name: 'The Artist' },
    { id: VIEWER, email: 'viewer@x.co', full_name: 'Viewer One' },
    { id: VIEWER2, email: 'viewer2@x.co', full_name: 'Viewer Two' },
    { id: OUTSIDER, email: 'outsider@x.co', full_name: 'Outsider' },
    { id: MOD_ID, email: 'mod@x.co', full_name: 'Moderator' },
    { id: ADMIN_ID, email: 'admin@x.co', full_name: 'Admin' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('startLive', () => {
  it('creates a live with defaults (guests + dedications allowed)', async () => {
    const l = await live.startLive(ARTIST, { title: 'My show' });
    expect(l.status).toBe('live');
    expect(l.artist_id).toBe(ARTIST);
    expect(l.started_at).toBeTruthy();
    expect(l.allow_guests).toBeTruthy();
    expect(l.allows_dedications).toBeTruthy();
  });

  it('honors explicit input overrides', async () => {
    const l = await live.startLive(ARTIST, {
      title: 'No guests',
      allowGuests: false,
      allowsDedications: false,
      dedicationMinPriceCredits: 20,
      roomId: 'room-1',
      streamUrl: 'https://cdn/x.m3u8',
    });
    expect(l.allow_guests).toBeFalsy();
    expect(l.allows_dedications).toBeFalsy();
    expect(Number(l.dedication_min_price_credits)).toBe(20);
    expect(l.room_id).toBe('room-1');
  });
});

describe('endLive', () => {
  it('404s an unknown live', async () => {
    await expect(live.endLive('00000000-0000-0000-0000-000000000000', ARTIST, [])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('forbids a non-owner, non-staff actor', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    await expect(live.endLive(l.id, OUTSIDER, [])).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('lets the host end their own live', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const ended = await live.endLive(l.id, ARTIST, []);
    expect(ended.status).toBe('ended');
    expect(ended.ended_at).toBeTruthy();
  });

  it('lets a moderator end a live they do not own', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const ended = await live.endLive(l.id, MOD_ID, ['moderator']);
    expect(ended.status).toBe('ended');
  });

  it('lets a synthetic system/admin actor end a live it does not own (moderation auto-stop)', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const ended = await live.endLive(l.id, 'system', ['admin']);
    expect(ended.status).toBe('ended');
  });
});

describe('updateLiveStatus', () => {
  it('404s an unknown live', async () => {
    await expect(
      live.updateLiveStatus('00000000-0000-0000-0000-000000000000', ARTIST, [], 'ended'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-owner, non-staff actor', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    await expect(live.updateLiveStatus(l.id, OUTSIDER, [], 'ended')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('lets the host transition status (e.g. upcoming to live)', async () => {
    // `started_at` is NOT NULL on `artist_lives`, so a row always carries one
    // from creation — the `!live.started_at` branch in updateLiveStatus is a
    // defensive no-op here; what's under test is the status transition itself.
    const l = await db.ArtistLive.create({
      artist_id: ARTIST,
      status: 'upcoming',
      started_at: new Date(),
      title: 'scheduled',
    });
    const updated = await live.updateLiveStatus(l.id, ARTIST, [], 'live');
    expect(updated.status).toBe('live');
    expect(updated.started_at).toBeTruthy();
  });

  it('sets ended_at when transitioning to ended, allowed for admin', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const updated = await live.updateLiveStatus(l.id, ADMIN_ID, ['admin'], 'ended');
    expect(updated.status).toBe('ended');
    expect(updated.ended_at).toBeTruthy();
  });
});

describe('updateLiveSettings', () => {
  it('404s an unknown live', async () => {
    await expect(
      live.updateLiveSettings('00000000-0000-0000-0000-000000000000', ARTIST, [], { allowGuests: false }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-owner, non-staff actor', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    await expect(live.updateLiveSettings(l.id, OUTSIDER, [], { allowGuests: false })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('lets the host update only the provided settings fields', async () => {
    const l = await live.startLive(ARTIST, { title: 't', allowGuests: true, allowsDedications: true });
    const updated = await live.updateLiveSettings(l.id, ARTIST, [], { allowGuests: false });
    expect(updated.allow_guests).toBeFalsy();
    expect(updated.allows_dedications).toBeTruthy(); // untouched
  });

  it('lets a moderator update settings on a live they do not own', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const updated = await live.updateLiveSettings(l.id, MOD_ID, ['moderator'], {
      dedicationMinPriceCredits: 30,
    });
    expect(Number(updated.dedication_min_price_credits)).toBe(30);
  });
});

describe('getLikes (incrementLikes uses MySQL-only raw SQL — see file header, not exercised here)', () => {
  it('reads zero when no likes row exists yet', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    expect(await live.getLikes(l.id)).toEqual({ likes: 0 });
  });

  it('reads the current count from a pre-seeded row', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    await db.LiveLike.create({ live_id: l.id, likes_count: 4 });
    expect(await live.getLikes(l.id)).toEqual({ likes: 4 });
  });
});

describe('join-request flow', () => {
  it('404s a join request against an unknown live', async () => {
    await expect(live.requestJoin('00000000-0000-0000-0000-000000000000', VIEWER)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('rejects a join request when the live disallows guests', async () => {
    const l = await live.startLive(ARTIST, { title: 't', allowGuests: false });
    await expect(live.requestJoin(l.id, VIEWER)).rejects.toMatchObject({ statusCode: 409, code: 'GUESTS_DISABLED' });
  });

  it('creates a pending request and is idempotent for the same pending pair', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const first = await live.requestJoin(l.id, VIEWER);
    const second = await live.requestJoin(l.id, VIEWER);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe('pending');
  });

  it('lists join requests, optionally filtered by status, hydrated with the user profile', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    await live.requestJoin(l.id, VIEWER);
    const req2 = await live.requestJoin(l.id, VIEWER2);
    await live.respondJoin(req2.id, ARTIST, 'accepted');

    const all = await live.listJoinRequests(l.id);
    expect(all).toHaveLength(2);
    const pendingOnly = await live.listJoinRequests(l.id, 'pending');
    expect(pendingOnly).toHaveLength(1);
    expect(pendingOnly[0].user).toMatchObject({ id: VIEWER, full_name: 'Viewer One' });
  });

  it('404s responding to an unknown join request', async () => {
    await expect(live.respondJoin('00000000-0000-0000-0000-000000000000', ARTIST, 'accepted')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('forbids a host response from someone other than the live owner', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const req = await live.requestJoin(l.id, VIEWER);
    await expect(live.respondJoin(req.id, OUTSIDER, 'accepted')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('accepting sets accepted_at, ending sets ended_at', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const req = await live.requestJoin(l.id, VIEWER);
    const accepted = await live.respondJoin(req.id, ARTIST, 'accepted');
    expect(accepted.status).toBe('accepted');
    expect(accepted.accepted_at).toBeTruthy();
    const ended = await live.respondJoin(req.id, ARTIST, 'ended');
    expect(ended.status).toBe('ended');
    expect(ended.ended_at).toBeTruthy();
  });

  it('404s cancelling an unknown join request', async () => {
    await expect(live.cancelJoinRequest('00000000-0000-0000-0000-000000000000', VIEWER, [])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lets the requester cancel their own request', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const req = await live.requestJoin(l.id, VIEWER);
    const cancelled = await live.cancelJoinRequest(req.id, VIEWER, []);
    expect(cancelled.status).toBe('cancelled');
  });

  it('lets the live host cancel a guest request', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const req = await live.requestJoin(l.id, VIEWER);
    const cancelled = await live.cancelJoinRequest(req.id, ARTIST, []);
    expect(cancelled.status).toBe('cancelled');
  });

  it('lets an admin cancel any guest request', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const req = await live.requestJoin(l.id, VIEWER);
    const cancelled = await live.cancelJoinRequest(req.id, ADMIN_ID, ['admin']);
    expect(cancelled.status).toBe('cancelled');
  });

  it('forbids an unrelated user (not requester, not host, not admin) from cancelling', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    const req = await live.requestJoin(l.id, VIEWER);
    await expect(live.cancelJoinRequest(req.id, OUTSIDER, [])).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('getReportSummary', () => {
  it('counts reports and flags whether the given viewer already reported', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    await db.LiveReport.bulkCreate([
      { live_id: l.id, user_id: VIEWER, reason: 'spam', status: 'pending' },
      { live_id: l.id, user_id: VIEWER2, reason: 'abuse', status: 'pending' },
    ]);
    expect(await live.getReportSummary(l.id, VIEWER)).toEqual({ count: 2, hasReported: true });
    expect(await live.getReportSummary(l.id, OUTSIDER)).toEqual({ count: 2, hasReported: false });
    expect(await live.getReportSummary(l.id)).toEqual({ count: 2, hasReported: false });
  });

  it('returns zero for a live with no reports', async () => {
    const l = await live.startLive(ARTIST, { title: 't' });
    expect(await live.getReportSummary(l.id, VIEWER)).toEqual({ count: 0, hasReported: false });
  });
});

describe('listLives / getLive / getLiveTitlesByIds', () => {
  beforeAll(async () => {
    await db.ArtistLive.destroy({ where: {} });
    await db.ArtistLive.bulkCreate([
      { id: '66666666-6666-6666-6666-666666666601', artist_id: ARTIST, status: 'live', started_at: new Date(), title: 'Live show' },
      { id: '66666666-6666-6666-6666-666666666602', artist_id: VIEWER, status: 'ended', started_at: new Date(), ended_at: new Date(), title: 'Past show' },
    ]);
  });

  it('lists lives filtered by status, with hydrated artist and boolean casting', async () => {
    const { rows, pagination } = await live.listLives({ status: 'live' });
    expect(rows).toHaveLength(1);
    expect(rows[0].artist).toMatchObject({ id: ARTIST, full_name: 'The Artist' });
    expect(typeof rows[0].allow_guests).toBe('boolean');
    expect(typeof rows[0].allows_dedications).toBe('boolean');
    expect(typeof rows[0].is_replay_available).toBe('boolean');
    expect(pagination).toHaveProperty('limit');
  });

  it('lists lives filtered by artistId', async () => {
    const { rows } = await live.listLives({ artistId: VIEWER });
    expect(rows).toHaveLength(1);
    expect(rows[0].artist_id).toBe(VIEWER);
  });

  it('404s getLive for an unknown id', async () => {
    await expect(live.getLive('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('getLive returns the artist profile, optional stage name and like count', async () => {
    await db.ArtistProfile.create({ user_id: ARTIST, stage_name: 'DJ Artist' });
    const detail = await live.getLive('66666666-6666-6666-6666-666666666601');
    expect(detail.artist).toMatchObject({ id: ARTIST, full_name: 'The Artist', stage_name: 'DJ Artist' });
    expect(detail.likes).toBe(0);
  });

  it('resolves titles for a batch of ids, ignoring unknown ones and empty input', async () => {
    const rows = await live.getLiveTitlesByIds([
      '66666666-6666-6666-6666-666666666601',
      '66666666-6666-6666-6666-666666666602',
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(rows.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { id: '66666666-6666-6666-6666-666666666601', title: 'Live show' },
      { id: '66666666-6666-6666-6666-666666666602', title: 'Past show' },
    ]);
    expect(await live.getLiveTitlesByIds([])).toEqual([]);
  });
});
