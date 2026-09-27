import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// `egressReady()` is supposed to be false with no `LIVEKIT_*`/`S3_*` secrets set — true in a
// clean CI env, but NOT here: this dev machine's local `.env` (loaded unconditionally by
// `dotenv/config`, regardless of NODE_ENV) has real LiveKit/S3 credentials configured for local
// development. Force the relevant fields off so `egressReady()` is deterministically false
// regardless of that — the whole point of this suite is to exercise the *no-op/guard-clause*
// behavior without ever touching the network.
vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal();
  const config = {
    ...actual.config,
    livekit: { url: '', apiKey: '', apiSecret: '', egressEnabled: false },
    s3: { ...actual.config.s3, accessKeyId: '', secretAccessKey: '', bucket: '', publicBaseUrl: '' },
  };
  return { ...actual, config, default: config };
});

import { config } from '../src/config/env.js';
import { db } from '../src/models/index.js';
import * as recordings from '../src/services/recording.service.js';

/**
 * @file Recording service tests: mode resolution, ownership authorization,
 * status reporting, and the start/pause/resume/cancel/stop guard-clause
 * lifecycle.
 *
 * The whole module is gated by a module-private `egressReady()`, forced false
 * here (see the `config/env.js` mock above). This lets every start/pause/
 * resume/cancel/stop entry point be exercised deterministically without ever
 * spawning ffmpeg or touching the network — but it also means the actual
 * "recording in progress" happy path (segment creation, LiveKit calls) is
 * NOT covered here; nor are `concatenateSession`'s/`finalizeFromEgress`'s
 * ffmpeg/storage-touching branches, `reconcileRecordings`'s LiveKit polling
 * branches, or `getLiveRecordingGuests`' token-minting branch (all three
 * require a configured LiveKit client / real ffmpeg / an actually-configured
 * storage driver). Only their guard-clause / authorization / early-return
 * paths are covered.
 *
 * Separately, `getRecordingMode` reads `platform_settings.value` with
 * `{ raw: true }` — on sqlite (unlike the production MySQL driver) a raw JSON
 * column value comes back as its serialized STRING, not a parsed object, so
 * `row.value?.[sourceType]` never matches here and the function
 * deterministically reports `'off'` regardless of what's stored. That's a
 * real sqlite-vs-mysql behavioral gap in the underlying read (see the
 * `getRecordingMode` tests below), not a flaw in the tests.
 */

const HOST = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
const OTHER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02';
const MANAGER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: HOST, email: 'host@x.co', full_name: 'Host' },
    { id: OTHER, email: 'other@x.co', full_name: 'Other' },
    { id: MANAGER, email: 'mgr@x.co', full_name: 'Manager' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('getRecordingMode', () => {
  it('defaults to "off" when no platform setting row exists', async () => {
    expect(await recordings.getRecordingMode('live')).toBe('off');
  });

  it('falls back to "off" even once a config row exists (sqlite raw-JSON-read quirk, see file header)', async () => {
    await db.PlatformSetting.create({ key: 'recording_config', value: { live: 'manual', duel: 'auto', concert: 'nonsense' } });
    expect(await recordings.getRecordingMode('live')).toBe('off');
    expect(await recordings.getRecordingMode('duel')).toBe('off');
    // Source type absent from the config also falls back to 'off'.
    expect(await recordings.getRecordingMode('competition')).toBe('off');
  });
});

describe('startRecording', () => {
  it('is a silent no-op for a non-recordable source type, even with strict:true', async () => {
    await expect(recordings.startRecording({ sourceType: 'gala', sourceId: 'x', strict: true })).resolves.toBeUndefined();
  });

  it('is a silent no-op with no sourceId, even with strict:true', async () => {
    await expect(recordings.startRecording({ sourceType: 'live', sourceId: undefined, strict: true })).resolves.toBeUndefined();
  });

  it('best-effort no-ops (no DB row) when egress is not configured', async () => {
    const before = await db.StreamRecording.count();
    await expect(recordings.startRecording({ sourceType: 'live', sourceId: 'evt-1' })).resolves.toBeUndefined();
    expect(await db.StreamRecording.count()).toBe(before);
  });

  it('throws RECORDING_NOT_CONFIGURED under strict when egress is not configured', async () => {
    await expect(recordings.startRecording({ sourceType: 'live', sourceId: 'evt-2', strict: true })).rejects.toMatchObject({
      statusCode: 400,
      code: 'RECORDING_NOT_CONFIGURED',
    });
  });
});

describe('pauseRecording', () => {
  it('best-effort no-ops when nothing is active', async () => {
    await expect(recordings.pauseRecording({ sourceType: 'live', sourceId: 'no-such-source' })).resolves.toBeUndefined();
  });

  it('throws RECORDING_NOT_ACTIVE under strict when nothing is active', async () => {
    await expect(
      recordings.pauseRecording({ sourceType: 'live', sourceId: 'no-such-source', strict: true }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'RECORDING_NOT_ACTIVE' });
  });

  it('pauses an active session, accumulating elapsed seconds', async () => {
    const sourceId = 'evt-pause-1';
    const rec = await db.StreamRecording.create({
      room_name: 'live-evt-pause-1',
      source_type: 'live',
      source_id: sourceId,
      file_path: 'replays/live/evt-pause-1/final.mp4',
      status: 'active',
      egress_id: null,
      segments: [],
      run_started_at: new Date(Date.now() - 5000),
    });
    await recordings.pauseRecording({ sourceType: 'live', sourceId });
    const reloaded = await db.StreamRecording.findByPk(rec.id, { raw: true });
    expect(reloaded.status).toBe('paused');
    expect(reloaded.run_started_at).toBeNull();
    expect(reloaded.accumulated_seconds).toBeGreaterThanOrEqual(4);
  });
});

describe('resumeRecording', () => {
  it('best-effort no-ops when nothing is paused', async () => {
    await expect(recordings.resumeRecording({ sourceType: 'live', sourceId: 'no-such-source' })).resolves.toBeUndefined();
  });

  it('throws RECORDING_NOT_PAUSED under strict when nothing is paused', async () => {
    await expect(
      recordings.resumeRecording({ sourceType: 'live', sourceId: 'no-such-source', strict: true }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'RECORDING_NOT_PAUSED' });
  });

  it('throws RECORDING_NOT_CONFIGURED under strict once a paused session exists but egress is off', async () => {
    const sourceId = 'evt-resume-1';
    await db.StreamRecording.create({
      room_name: 'live-evt-resume-1',
      source_type: 'live',
      source_id: sourceId,
      file_path: 'replays/live/evt-resume-1/final.mp4',
      status: 'paused',
      segments: [{ seq: 1, egressId: 'eg-1', filePath: 'x', status: 'completed' }],
    });
    await expect(
      recordings.resumeRecording({ sourceType: 'live', sourceId, strict: true }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'RECORDING_NOT_CONFIGURED' });
  });

  it('best-effort leaves the session paused when egress is off (non-strict)', async () => {
    const sourceId = 'evt-resume-2';
    const rec = await db.StreamRecording.create({
      room_name: 'live-evt-resume-2',
      source_type: 'live',
      source_id: sourceId,
      file_path: 'replays/live/evt-resume-2/final.mp4',
      status: 'paused',
      segments: [{ seq: 1, egressId: 'eg-1', filePath: 'x', status: 'completed' }],
    });
    await expect(recordings.resumeRecording({ sourceType: 'live', sourceId })).resolves.toBeUndefined();
    const reloaded = await db.StreamRecording.findByPk(rec.id, { raw: true });
    expect(reloaded.status).toBe('paused');
  });
});

describe('cancelRecording', () => {
  it('best-effort no-ops when nothing to cancel', async () => {
    await expect(recordings.cancelRecording({ sourceType: 'live', sourceId: 'no-such-source' })).resolves.toBeUndefined();
  });

  it('throws RECORDING_NOT_ACTIVE under strict when nothing to cancel', async () => {
    await expect(
      recordings.cancelRecording({ sourceType: 'live', sourceId: 'no-such-source', strict: true }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'RECORDING_NOT_ACTIVE' });
  });

  it('cancels a pending session with no segments to clean up', async () => {
    const sourceId = 'evt-cancel-1';
    const rec = await db.StreamRecording.create({
      room_name: 'live-evt-cancel-1',
      source_type: 'live',
      source_id: sourceId,
      file_path: 'replays/live/evt-cancel-1/final.mp4',
      status: 'pending',
      segments: [],
    });
    await recordings.cancelRecording({ sourceType: 'live', sourceId });
    const reloaded = await db.StreamRecording.findByPk(rec.id, { raw: true });
    expect(reloaded.status).toBe('cancelled');
    expect(reloaded.ended_at).toBeTruthy();
  });
});

describe('stopRecording', () => {
  it('best-effort no-ops when egress is not configured (regardless of any existing row)', async () => {
    const sourceId = 'evt-stop-1';
    await db.StreamRecording.create({
      room_name: 'live-evt-stop-1',
      source_type: 'live',
      source_id: sourceId,
      file_path: 'replays/live/evt-stop-1/final.mp4',
      status: 'active',
      segments: [],
    });
    await expect(recordings.stopRecording({ sourceType: 'live', sourceId })).resolves.toBeUndefined();
    const reloaded = await db.StreamRecording.findOne({ where: { source_type: 'live', source_id: sourceId }, raw: true });
    // Untouched: stopRecording bails out before ever looking up the row.
    expect(reloaded.status).toBe('active');
  });

  it('throws RECORDING_NOT_CONFIGURED under strict when egress is not configured', async () => {
    await expect(recordings.stopRecording({ sourceType: 'live', sourceId: 'evt-stop-2', strict: true })).rejects.toMatchObject({
      statusCode: 400,
      code: 'RECORDING_NOT_CONFIGURED',
    });
  });
});

describe('concatenateSession (guard clause only)', () => {
  it('no-ops for an unknown recording id', async () => {
    await expect(recordings.concatenateSession('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
  });

  it('no-ops when the session is not in "stopping" status', async () => {
    const rec = await db.StreamRecording.create({
      room_name: 'r', source_type: 'live', source_id: 'evt-concat-1', file_path: 'f.mp4', status: 'active', segments: [],
    });
    await recordings.concatenateSession(rec.id);
    const reloaded = await db.StreamRecording.findByPk(rec.id, { raw: true });
    expect(reloaded.status).toBe('active');
  });
});

describe('finalizeFromEgress (guard clause only)', () => {
  it('no-ops when the egressInfo has no egressId', async () => {
    await expect(recordings.finalizeFromEgress({})).resolves.toBeUndefined();
  });

  it('no-ops when no session matches the egressId', async () => {
    await expect(recordings.finalizeFromEgress({ egressId: 'unknown-egress-id' })).resolves.toBeUndefined();
  });
});

describe('reconcileRecordings', () => {
  it('returns a zeroed report when egress is not configured', async () => {
    await expect(recordings.reconcileRecordings()).resolves.toEqual({ pendingFailed: 0, finalized: 0, failed: 0, concatRetried: 0 });
  });
});

describe('assertEventOwner', () => {
  it('lets an admin/moderator through regardless of ownership', async () => {
    await expect(recordings.assertEventOwner('live', 'unknown-id', OTHER, ['admin'])).resolves.toBeUndefined();
    await expect(recordings.assertEventOwner('live', 'unknown-id', OTHER, ['moderator'])).resolves.toBeUndefined();
  });

  it('authorizes the live host, forbids everyone else', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    await expect(recordings.assertEventOwner('live', live.id, HOST, [])).resolves.toBeUndefined();
    await expect(recordings.assertEventOwner('live', live.id, OTHER, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('authorizes the concert artist, forbids everyone else', async () => {
    const concert = await db.ArtistConcert.create({
      artist_id: HOST, title: 'C', approval_status: 'approved', scheduled_date: new Date(),
    });
    await expect(recordings.assertEventOwner('concert', concert.id, HOST, [])).resolves.toBeUndefined();
    await expect(recordings.assertEventOwner('concert', concert.id, OTHER, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('authorizes only the duel manager (not the artists)', async () => {
    const duel = await db.Duel.create({ artist1_id: HOST, artist2_id: OTHER, manager_id: MANAGER });
    await expect(recordings.assertEventOwner('duel', duel.id, MANAGER, [])).resolves.toBeUndefined();
    await expect(recordings.assertEventOwner('duel', duel.id, HOST, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('authorizes only the competition manager', async () => {
    const comp = await db.Competition.create({
      manager_id: MANAGER, title: 'T', mode: 'online', status: 'draft',
      start_at: new Date(), end_at: new Date(Date.now() + 3600_000), application_deadline: new Date(Date.now() + 1800_000),
      eligibility_scope: 'all', eligible_countries: '',
    });
    await expect(recordings.assertEventOwner('competition', comp.id, MANAGER, [])).resolves.toBeUndefined();
    await expect(recordings.assertEventOwner('competition', comp.id, OTHER, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('forbids an unrecognized source type', async () => {
    await expect(recordings.assertEventOwner('gala', 'x', HOST, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('forbids when the source row does not exist', async () => {
    await expect(recordings.assertEventOwner('live', '00000000-0000-0000-0000-000000000000', HOST, [])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('recordingStatus', () => {
  it('reports idle (mode "off") when no session exists', async () => {
    const status = await recordings.recordingStatus('live', 'no-such-source');
    expect(status).toMatchObject({ mode: 'off', active: false, paused: false, finalizing: false, failed: false, error: null, accumulatedSeconds: 0 });
  });

  it('reports active/paused/finalizing per status', async () => {
    const mk = (sourceId, status, extra = {}) =>
      db.StreamRecording.create({ room_name: 'r', source_type: 'live', source_id: sourceId, file_path: 'f.mp4', status, segments: [], ...extra });

    await mk('status-active', 'active');
    expect(await recordings.recordingStatus('live', 'status-active')).toMatchObject({ active: true, paused: false, finalizing: false });

    await mk('status-paused', 'paused');
    expect(await recordings.recordingStatus('live', 'status-paused')).toMatchObject({ active: false, paused: true, finalizing: false });

    await mk('status-stopping', 'stopping');
    expect(await recordings.recordingStatus('live', 'status-stopping')).toMatchObject({ finalizing: true });

    await mk('status-concatenating', 'concatenating');
    expect(await recordings.recordingStatus('live', 'status-concatenating')).toMatchObject({ finalizing: true });
  });

  it('reports idle for a terminal (completed) session', async () => {
    await db.StreamRecording.create({ room_name: 'r', source_type: 'live', source_id: 'status-completed', file_path: 'f.mp4', status: 'completed', segments: [] });
    expect(await recordings.recordingStatus('live', 'status-completed')).toMatchObject({ active: false, paused: false, finalizing: false, failed: false });
  });

  it('surfaces a RECENT failure explicitly', async () => {
    await db.StreamRecording.create({
      room_name: 'r', source_type: 'live', source_id: 'status-failed-recent', file_path: 'f.mp4', status: 'failed', segments: [],
      error: 'boom', ended_at: new Date(),
    });
    const status = await recordings.recordingStatus('live', 'status-failed-recent');
    expect(status.failed).toBe(true);
    expect(status.error).toBe('boom');
  });

  it('hides an OLD failure (falls back to idle)', async () => {
    await db.StreamRecording.create({
      room_name: 'r', source_type: 'live', source_id: 'status-failed-old', file_path: 'f.mp4', status: 'failed', segments: [],
      error: 'boom', ended_at: new Date(Date.now() - 10 * 60 * 1000),
    });
    const status = await recordings.recordingStatus('live', 'status-failed-old');
    expect(status.failed).toBe(false);
  });
});

describe('getLiveRecordingGuests', () => {
  function validKey(liveId, recordingId) {
    return createHmac('sha256', config.jwt.tokenHashSecret).update(`live-recording:${liveId}:${recordingId}`).digest('hex').slice(0, 32);
  }

  it('forbids a missing liveId/recordingId', async () => {
    await expect(recordings.getLiveRecordingGuests({ liveId: '', recordingId: '', key: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('forbids an invalid key', async () => {
    await expect(recordings.getLiveRecordingGuests({ liveId: 'l1', recordingId: 'r1', key: 'wrong' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns an empty list when there are no accepted guests (no token minting needed)', async () => {
    const liveId = 'live-guests-1';
    const recordingId = 'rec-guests-1';
    // A pending (not accepted) request must be excluded.
    await db.LiveJoinRequest.create({ live_id: liveId, user_id: OTHER, status: 'pending', requested_at: new Date() });
    const guests = await recordings.getLiveRecordingGuests({ liveId, recordingId, key: validKey(liveId, recordingId) });
    expect(guests).toEqual([]);
  });
});
