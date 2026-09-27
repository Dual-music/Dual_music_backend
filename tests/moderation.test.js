import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// This dev machine's local `.env` (loaded unconditionally by `dotenv/config`,
// regardless of NODE_ENV) has real SMTP + LiveKit/S3 credentials, so calling
// `notifyUser`/`startRecording`/`stopRecording` for real here would attempt
// real network I/O (slow and flaky — observed 3-20s per email send). Stub
// them so this suite is fast and deterministic everywhere it runs.
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));
vi.mock('../src/services/recording.service.js', () => ({
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  default: {},
}));
// `maybeAutoStop`'s viewer-count gate reads `getRoomSize` — always 0 with no
// real Socket.IO server attached. Pin it to a small constant so the
// auto-stop tests can deterministically cross the (percentage-of-viewers)
// threshold by seeding a known number of pending reports (see below).
vi.mock('../src/realtime/bus.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getRoomSize: () => 5 };
});

import { db } from '../src/models/index.js';
import * as moderation from '../src/services/moderation.service.js';

/**
 * @file Moderation service tests: reports (account/live/competition) + their
 * best-effort admin-alert/auto-stop post-processing, per-event bans (stream +
 * competition), platform-wide bans (dual-write `users`/`profiles`) and
 * warnings.
 *
 * `createReport` fires its post-processing (`handleNewReport` → admin notify +
 * `maybeAutoStop`) fire-and-forget (`void handleNewReport(...).catch(...)`),
 * so the auto-stop tests poll the target row for a short window instead of
 * assuming a fixed number of microtask ticks.
 *
 * `maybeAutoStop` reads its `live_report_config` platform setting with
 * `{ raw: true }` — on sqlite (unlike the production MySQL driver) a raw JSON
 * column value comes back as its serialized STRING, not a parsed object, so
 * `cfg.viewer_threshold`/`cfg.stop_percentage` never read through and the
 * function's hardcoded defaults (5 viewers, 75%) always apply here regardless
 * of what's stored. The auto-stop tests below work WITH that default (a
 * pinned `getRoomSize` of 5, and enough pending reports to clear 75%) rather
 * than trying to configure it away.
 */

const REPORTER = '99999999-9999-9999-9999-999999999901';
const TARGET_USER = '99999999-9999-9999-9999-999999999902';
const ADMIN_ID = '99999999-9999-9999-9999-999999999903';
const ARTIST1 = '99999999-9999-9999-9999-999999999911';
const ARTIST2 = '99999999-9999-9999-9999-999999999912';
const MANAGER = '99999999-9999-9999-9999-999999999913';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: REPORTER, email: 'reporter@x.co', full_name: 'Reporter' },
    { id: TARGET_USER, email: 'target@x.co', full_name: 'Target' },
    { id: ADMIN_ID, email: 'admin@x.co', full_name: 'Admin' },
    { id: ARTIST1, email: 'a1@x.co', full_name: 'Artist 1' },
    { id: ARTIST2, email: 'a2@x.co', full_name: 'Artist 2' },
    { id: MANAGER, email: 'mgr@x.co', full_name: 'Manager' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

/** Polls `check` until it returns truthy or `timeout` elapses. */
async function waitUntil(check, { timeout = 3000, interval = 25 } = {}) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start >= timeout) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
}

describe('createReport', () => {
  it('rejects an unknown kind', async () => {
    await expect(moderation.createReport('gala', REPORTER, { reason: 'x' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('requires the target id for the kind', async () => {
    await expect(moderation.createReport('account', REPORTER, { reason: 'x' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('creates a pending account report', async () => {
    const report = await moderation.createReport('account', REPORTER, { reportedUserId: TARGET_USER, reason: 'spam' });
    expect(report).toMatchObject({ reporter_id: REPORTER, reported_user_id: TARGET_USER, reason: 'spam', status: 'pending' });
  });

  it('creates a live report tagged with the declared streamType', async () => {
    const report = await moderation.createReport('live', REPORTER, { liveId: 'live-xyz', streamType: 'concert', reason: 'abuse' });
    expect(report).toMatchObject({ live_id: 'live-xyz', event_type: 'concert', status: 'pending' });
  });

  it('defaults the live report event_type to "live" when streamType is omitted', async () => {
    const report = await moderation.createReport('live', REPORTER, { liveId: 'live-abc', reason: 'abuse' });
    expect(report.event_type).toBe('live');
  });

  it('creates a competition report', async () => {
    const report = await moderation.createReport('competition', REPORTER, { competitionId: 'comp-xyz', reason: 'cheating' });
    expect(report).toMatchObject({ competition_id: 'comp-xyz', status: 'pending' });
  });
});

describe('listReports / reviewReport', () => {
  it('rejects an unknown kind', async () => {
    await expect(moderation.listReports('gala', {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(moderation.reviewReport('gala', 'x', ADMIN_ID, 'resolved')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('lists account reports hydrated with the reporter profile', async () => {
    const { rows } = await moderation.listReports('account', {});
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].reporter).toMatchObject({ id: expect.any(String) });
  });

  it('404s reviewing an unknown report', async () => {
    await expect(moderation.reviewReport('account', '00000000-0000-0000-0000-000000000000', ADMIN_ID, 'resolved')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('reviews (resolves) a report and stamps the reviewer', async () => {
    const created = await moderation.createReport('account', REPORTER, { reportedUserId: TARGET_USER, reason: 'again' });
    const reviewed = await moderation.reviewReport('account', created.id, ADMIN_ID, 'resolved', 'Admin');
    expect(reviewed.status).toBe('resolved');
    expect(reviewed.reviewed_by).toBe(ADMIN_ID);
    expect(reviewed.reviewed_at).toBeTruthy();
  });
});

describe('aggregateAccountReports', () => {
  it('aggregates counts per reported user, most-reported first', async () => {
    const rows = await moderation.aggregateAccountReports();
    const row = rows.find((r) => r.reported_user_id === TARGET_USER);
    expect(row).toBeTruthy();
    expect(Number(row.count)).toBeGreaterThanOrEqual(2);
  });
});

describe('stream bans', () => {
  const streamId = 'duel-stream-1';
  const ADMIN_ACTOR = { id: ADMIN_ID };

  it('bans a user from a stream (admin bypass — the fake streamId matches no real duel)', async () => {
    const ban = await moderation.banFromStream({
      streamId, streamType: 'duel', bannedUserId: TARGET_USER, bannedBy: ADMIN_ID, reason: 'toxic',
      actor: ADMIN_ACTOR, actorRoles: ['admin'],
    });
    expect(ban).toMatchObject({ stream_id: streamId, stream_type: 'duel', banned_user_id: TARGET_USER, reason: 'toxic' });
  });

  it('rejects a non-host, non-moderator actor', async () => {
    await expect(
      moderation.banFromStream({
        streamId, streamType: 'duel', bannedUserId: TARGET_USER, bannedBy: REPORTER,
        actor: { id: REPORTER }, actorRoles: ['artist'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists bans, optionally scoped to one stream', async () => {
    const scoped = await moderation.listStreamBans(streamId, 'duel');
    expect(scoped).toHaveLength(1);
    const all = await moderation.listStreamBans();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('lifts a stream ban (admin bypass)', async () => {
    const scoped = await moderation.listStreamBans(streamId, 'duel');
    const result = await moderation.liftStreamBan(scoped[0].id, ADMIN_ACTOR, ['admin']);
    expect(result).toEqual({ removed: true });
    expect(await moderation.listStreamBans(streamId, 'duel')).toHaveLength(0);
  });

  it('reports removed:false lifting an unknown ban', async () => {
    expect(await moderation.liftStreamBan('00000000-0000-0000-0000-000000000000', ADMIN_ACTOR, ['admin'])).toEqual({ removed: false });
  });
});

describe('competition bans', () => {
  const competitionId = 'comp-ban-1';
  const ADMIN_ACTOR = { id: ADMIN_ID };

  it('bans a user from a competition (admin bypass — the fake competitionId matches no real row)', async () => {
    const ban = await moderation.banFromCompetition({
      competitionId, bannedUserId: TARGET_USER, bannedBy: ADMIN_ID, reason: 'cheating',
      actor: ADMIN_ACTOR, actorRoles: ['admin'],
    });
    expect(ban).toMatchObject({ competition_id: competitionId, banned_user_id: TARGET_USER });
  });

  it('rejects a non-host, non-moderator actor', async () => {
    await expect(
      moderation.banFromCompetition({
        competitionId, bannedUserId: TARGET_USER, bannedBy: REPORTER,
        actor: { id: REPORTER }, actorRoles: ['artist'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists competition bans, optionally scoped', async () => {
    const scoped = await moderation.listCompetitionBans(competitionId);
    expect(scoped).toHaveLength(1);
  });

  it('lifts a competition ban (admin bypass)', async () => {
    const scoped = await moderation.listCompetitionBans(competitionId);
    expect(await moderation.liftCompetitionBan(scoped[0].id, ADMIN_ACTOR, ['admin'])).toEqual({ removed: true });
  });
});

describe('canModerateEvent + appointed moderators', () => {
  it('the primary host (manager) can moderate their own duel', async () => {
    const duel = await db.Duel.create({ artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'live' });
    expect(await moderation.canModerateEvent('duel', duel.id, { id: MANAGER }, [])).toBe(true);
    expect(await moderation.canModerateEvent('duel', duel.id, { id: ARTIST1 }, [])).toBe(false);
  });

  it('the host can appoint up to 2 moderators, not more, not the host themself, not twice', async () => {
    const duel = await db.Duel.create({ artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'live' });
    const hostActor = { id: MANAGER };

    await expect(moderation.appointModerator('duel', duel.id, hostActor, [], MANAGER)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(moderation.appointModerator('duel', duel.id, { id: ARTIST1 }, [], REPORTER)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await moderation.appointModerator('duel', duel.id, hostActor, [], ARTIST1);
    await expect(moderation.appointModerator('duel', duel.id, hostActor, [], ARTIST1)).rejects.toMatchObject({ code: 'ALREADY_MODERATOR' });
    await moderation.appointModerator('duel', duel.id, hostActor, [], ARTIST2);
    await expect(moderation.appointModerator('duel', duel.id, hostActor, [], REPORTER)).rejects.toMatchObject({ code: 'MODERATOR_LIMIT_REACHED' });

    expect(await moderation.canModerateEvent('duel', duel.id, { id: ARTIST1 }, [])).toBe(true);
    const list = await moderation.listEventModerators('duel', duel.id);
    expect(list.map((m) => m.user_id).sort()).toEqual([ARTIST1, ARTIST2].sort());

    await moderation.revokeModerator('duel', duel.id, hostActor, [], ARTIST1);
    expect(await moderation.canModerateEvent('duel', duel.id, { id: ARTIST1 }, [])).toBe(false);
  });

  it('an appointed moderator (not the host) can then ban from that duel', async () => {
    const duel = await db.Duel.create({ artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'live' });
    await moderation.appointModerator('duel', duel.id, { id: MANAGER }, [], REPORTER);
    const ban = await moderation.banFromStream({
      streamId: duel.id, streamType: 'duel', bannedUserId: TARGET_USER, bannedBy: REPORTER,
      actor: { id: REPORTER }, actorRoles: ['fan'],
    });
    expect(ban).toMatchObject({ stream_id: duel.id, banned_user_id: TARGET_USER });
  });

  it('listCurrentViewers requires the host (no realtime server attached in tests → empty list)', async () => {
    const duel = await db.Duel.create({ artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'live' });
    await expect(moderation.listCurrentViewers('duel', duel.id, { id: ARTIST1 }, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await moderation.listCurrentViewers('duel', duel.id, { id: MANAGER }, [])).toEqual([]);
  });
});

describe('platform bans', () => {
  const USER_ID = '99999999-9999-9999-9999-999999999950';

  beforeAll(async () => {
    await db.User.create({ id: USER_ID, email: 'banme@x.co' });
    await db.Profile.create({ id: USER_ID, email: 'banme@x.co', full_name: 'Ban Me' });
  });

  it('404s for a user with no profile', async () => {
    await expect(
      moderation.banFromPlatform({ userId: '00000000-0000-0000-0000-000000000000', adminId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('bans a user permanently, mirroring users + profiles', async () => {
    const profile = await moderation.banFromPlatform({ userId: USER_ID, adminId: ADMIN_ID, adminName: 'Admin', reason: 'fraud', permanent: true });
    expect(profile.is_banned).toBe(true);
    expect(profile.banned_is_permanent).toBe(true);
    expect(profile.banned_until).toBeNull();

    const user = await db.User.findByPk(USER_ID, { raw: true });
    expect(user.is_banned).toBeTruthy(); // raw read → 1 on SQLite
    expect(user.banned_at).toBeTruthy();
  });

  it('lists platform-banned users', async () => {
    const { rows } = await moderation.listPlatformBans({});
    expect(rows.some((r) => r.id === USER_ID)).toBe(true);
  });

  it('unbans a user, mirroring users + profiles', async () => {
    const profile = await moderation.unbanFromPlatform({ userId: USER_ID, adminId: ADMIN_ID });
    expect(profile.is_banned).toBe(false);
    expect(profile.banned_is_permanent).toBe(false);

    const user = await db.User.findByPk(USER_ID, { raw: true });
    expect(user.is_banned).toBeFalsy(); // raw read → 0 on SQLite
  });

  it('404s unbanning a user with no profile', async () => {
    await expect(
      moderation.unbanFromPlatform({ userId: '00000000-0000-0000-0000-000000000000', adminId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('supports a temporary ban with an expiry', async () => {
    const until = new Date(Date.now() + 86_400_000);
    const profile = await moderation.banFromPlatform({ userId: USER_ID, adminId: ADMIN_ID, permanent: false, until });
    expect(profile.banned_is_permanent).toBe(false);
    expect(new Date(profile.banned_until).getTime()).toBe(until.getTime());
  });
});

describe('warnings', () => {
  it('issues a warning and notifies the user', async () => {
    const warning = await moderation.issueWarning({ userId: TARGET_USER, message: 'Please behave', issuedBy: ADMIN_ID });
    expect(warning).toMatchObject({ user_id: TARGET_USER, warning_message: 'Please behave', issued_by: ADMIN_ID, is_automatic: false });
  });

  it('issues an automatic warning', async () => {
    const warning = await moderation.issueWarning({ userId: TARGET_USER, message: 'Auto flag', issuedBy: ADMIN_ID, isAutomatic: true });
    expect(warning.is_automatic).toBe(true);
  });

  it('lists a user\'s own warnings, newest first', async () => {
    const list = await moderation.listMyWarnings(TARGET_USER);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('lists all warnings platform-wide', async () => {
    const list = await moderation.listAllWarnings();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});

describe('auto-stop on report threshold (fire-and-forget post-processing)', () => {
  // `getRoomSize` is pinned to 5 above, and the config-read quirk (see the file header) means
  // `maybeAutoStop` always uses its hardcoded 75% default — so 4 pending reports (80%) on a
  // single event is what actually crosses the threshold. Three are seeded directly and the
  // fourth is the real `createReport` call under test, which triggers the post-processing.
  async function seedPendingLiveReports(liveId, eventType, count) {
    for (let i = 0; i < count; i += 1) {
      await db.LiveReport.create({ user_id: REPORTER, live_id: liveId, event_type: eventType, reason: 'seed', status: 'pending' });
    }
  }
  async function seedPendingCompetitionReports(competitionId, count) {
    for (let i = 0; i < count; i += 1) {
      await db.CompetitionReport.create({ reporter_id: REPORTER, competition_id: competitionId, reason: 'seed', status: 'pending' });
    }
  }

  it('auto-ends a duel once the report ratio crosses the threshold', async () => {
    const duel = await db.Duel.create({ artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'live' });
    await seedPendingLiveReports(duel.id, 'duel', 3);
    await moderation.createReport('live', REPORTER, { liveId: duel.id, streamType: 'duel', reason: 'abuse' });
    const ended = await waitUntil(async () => (await db.Duel.findByPk(duel.id, { raw: true })).status === 'ended');
    expect(ended).toBe(true);
  });

  it('auto-ends a live once the report ratio crosses the threshold', async () => {
    const live = await db.ArtistLive.create({ artist_id: ARTIST1, status: 'live', started_at: new Date() });
    await seedPendingLiveReports(live.id, 'live', 3);
    await moderation.createReport('live', REPORTER, { liveId: live.id, reason: 'abuse' });
    const ended = await waitUntil(async () => (await db.ArtistLive.findByPk(live.id, { raw: true })).status === 'ended');
    expect(ended).toBe(true);
  });

  it('auto-cancels a competition once the report ratio crosses the threshold', async () => {
    const comp = await db.Competition.create({
      manager_id: MANAGER,
      title: 'Auto-stop comp',
      mode: 'online',
      status: 'published',
      start_at: new Date(),
      end_at: new Date(Date.now() + 3600_000),
      application_deadline: new Date(Date.now() + 1800_000),
      max_candidates: 0,
      eligibility_scope: 'all',
      eligible_countries: '',
    });
    await seedPendingCompetitionReports(comp.id, 3);
    await moderation.createReport('competition', REPORTER, { competitionId: comp.id, reason: 'cheating' });
    const cancelled = await waitUntil(async () => (await db.Competition.findByPk(comp.id, { raw: true })).status === 'cancelled');
    expect(cancelled).toBe(true);
  });

  it('does not auto-stop below the report-ratio threshold', async () => {
    const duel = await db.Duel.create({ artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'live' });
    // Only 1 pending report against a pinned viewer count of 5 (20%, under the 75% default).
    await moderation.createReport('live', REPORTER, { liveId: duel.id, streamType: 'duel', reason: 'meh' });
    const ended = await waitUntil(async () => (await db.Duel.findByPk(duel.id, { raw: true })).status === 'ended', { timeout: 500 });
    expect(ended).toBe(false);
    expect((await db.Duel.findByPk(duel.id, { raw: true })).status).toBe('live');
  });
});
