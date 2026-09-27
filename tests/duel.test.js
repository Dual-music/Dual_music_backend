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
import * as duels from '../src/services/duel.service.js';

/**
 * @file Duel service tests: création (règles manager/ticket), cycle de vie
 * `updateDuel` (autorisation participant/manager/admin + reprogrammation
 * admin-only), le flux des invitations (créer/répondre/changer la date),
 * les listes (`listDuels`, `listMyDuelRequests`), les lectures (`getDuel`,
 * `getDuelsByIds`), les totaux de votes payants et l'historique de vote/ticket
 * du votant.
 *
 * `getVoteTotals`/`getVoteTotalsByDuelIds` utilisent du SQL brut portable
 * (SUM/GROUP BY) — pas de procédure stockée MySQL ici, donc pleinement
 * testable sous SQLite (contrairement à la casting/vote/gift ATOMIQUE qui,
 * elle, passe par `callProcedure` ailleurs dans le service de wallet).
 */

const ARTIST1 = '11111111-1111-1111-1111-111111111101';
const ARTIST2 = '11111111-1111-1111-1111-111111111102';
const ARTIST3 = '11111111-1111-1111-1111-111111111103';
const MANAGER = '11111111-1111-1111-1111-111111111104';
const OUTSIDER = '11111111-1111-1111-1111-111111111105';
const ADMIN_ID = '11111111-1111-1111-1111-111111111106';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: ARTIST1, email: 'a1@x.co', full_name: 'Artist One' },
    { id: ARTIST2, email: 'a2@x.co', full_name: 'Artist Two' },
    { id: ARTIST3, email: 'a3@x.co', full_name: 'Artist Three' },
    { id: MANAGER, email: 'mgr@x.co', full_name: 'Manager' },
    { id: OUTSIDER, email: 'out@x.co', full_name: 'Outsider' },
    { id: ADMIN_ID, email: 'admin@x.co', full_name: 'Admin' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('createDuel', () => {
  it('auto-assigns the manager when the creator holds the manager role', async () => {
    const duel = await duels.createDuel(MANAGER, ['manager'], { artist1Id: ARTIST1, artist2Id: ARTIST2, ticketPrice: 5 });
    expect(duel.manager_id).toBe(MANAGER);
    expect(Number(duel.ticket_price)).toBe(5);
    expect(duel.status).toBe('upcoming');
  });

  it('leaves manager_id null when the creator is not a manager', async () => {
    const duel = await duels.createDuel(ADMIN_ID, ['admin'], { artist1Id: ARTIST1, artist2Id: ARTIST2 });
    expect(duel.manager_id).toBeNull();
    expect(Number(duel.ticket_price)).toBe(0);
  });

  it('serializes scheduledTime to an ISO string', async () => {
    const duel = await duels.createDuel(ADMIN_ID, ['admin'], {
      artist1Id: ARTIST1,
      artist2Id: ARTIST2,
      scheduledTime: '2026-01-01T10:00:00.000Z',
    });
    expect(duel.scheduled_time).toBe('2026-01-01T10:00:00.000Z');
  });

  it('rejects an artist duelling themself', async () => {
    await expect(
      duels.createDuel(ADMIN_ID, ['admin'], { artist1Id: ARTIST1, artist2Id: ARTIST1 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });
});

describe('getDuel / getDuelsByIds', () => {
  let duelId;
  beforeAll(async () => {
    const d = await db.Duel.create({
      id: '22222222-2222-2222-2222-222222222201',
      artist1_id: ARTIST1,
      artist2_id: ARTIST2,
      manager_id: MANAGER,
      status: 'upcoming',
    });
    duelId = d.id;
  });

  it('404s an unknown duel', async () => {
    await expect(duels.getDuel('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('hydrates artists, manager and empty vote totals', async () => {
    const duel = await duels.getDuel(duelId);
    expect(duel.artist1).toMatchObject({ id: ARTIST1, full_name: 'Artist One' });
    expect(duel.artist2).toMatchObject({ id: ARTIST2, full_name: 'Artist Two' });
    expect(duel.manager).toMatchObject({ id: MANAGER });
    expect(duel.voteTotals).toEqual([]);
  });

  it('batch-fetches duels by id, ignoring unknown ids and empty input', async () => {
    const rows = await duels.getDuelsByIds([duelId, '00000000-0000-0000-0000-000000000000']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: duelId, artist1_id: ARTIST1, artist2_id: ARTIST2 });
    expect(await duels.getDuelsByIds([])).toEqual([]);
  });
});

describe('vote totals', () => {
  const duelA = '22222222-2222-2222-2222-222222222301';
  const duelB = '22222222-2222-2222-2222-222222222302';
  beforeAll(async () => {
    await db.Duel.bulkCreate([
      { id: duelA, artist1_id: ARTIST1, artist2_id: ARTIST2, status: 'ended' },
      { id: duelB, artist1_id: ARTIST1, artist2_id: ARTIST3, status: 'ended' },
    ]);
    await db.DuelVote.bulkCreate([
      { duel_id: duelA, artist_id: ARTIST1, user_id: OUTSIDER, amount: 10 },
      { duel_id: duelA, artist_id: ARTIST1, user_id: MANAGER, amount: 5 },
      { duel_id: duelA, artist_id: ARTIST2, user_id: OUTSIDER, amount: 7 },
      { duel_id: duelB, artist_id: ARTIST3, user_id: OUTSIDER, amount: 20 },
    ]);
  });

  it('sums per-artist totals for a single duel', async () => {
    const totals = await duels.getVoteTotals(duelA);
    const byArtist = Object.fromEntries(totals.map((t) => [t.artist_id, Number(t.total)]));
    expect(byArtist[ARTIST1]).toBe(15);
    expect(byArtist[ARTIST2]).toBe(7);
  });

  it('sums per-artist totals across many duels in one query', async () => {
    const totals = await duels.getVoteTotalsByDuelIds([duelA, duelB, duelA]);
    const byKey = Object.fromEntries(totals.map((t) => [`${t.duel_id}:${t.artist_id}`, Number(t.total)]));
    expect(byKey[`${duelA}:${ARTIST1}`]).toBe(15);
    expect(byKey[`${duelB}:${ARTIST3}`]).toBe(20);
  });

  it('short-circuits to an empty array for no ids', async () => {
    expect(await duels.getVoteTotalsByDuelIds([])).toEqual([]);
  });
});

describe('updateDuel', () => {
  let duelId;
  beforeAll(async () => {
    const d = await db.Duel.create({
      id: '22222222-2222-2222-2222-222222222401',
      artist1_id: ARTIST1,
      artist2_id: ARTIST2,
      manager_id: MANAGER,
      status: 'upcoming',
    });
    duelId = d.id;
  });

  it('404s an unknown duel', async () => {
    await expect(
      duels.updateDuel('00000000-0000-0000-0000-000000000000', { id: ARTIST1 }, [], { status: 'live' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-participant, non-admin actor', async () => {
    await expect(
      duels.updateDuel(duelId, { id: OUTSIDER }, [], { status: 'live' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('lets a participant artist start the duel (sets started_at)', async () => {
    const updated = await duels.updateDuel(duelId, { id: ARTIST1 }, [], { status: 'live' });
    expect(updated.status).toBe('live');
    expect(updated.started_at).toBeTruthy();
  });

  it('lets the manager end the duel and set a winner (sets ended_at)', async () => {
    const updated = await duels.updateDuel(duelId, { id: MANAGER }, [], { status: 'ended', winnerId: ARTIST1 });
    expect(updated.status).toBe('ended');
    expect(updated.ended_at).toBeTruthy();
    expect(updated.winner_id).toBe(ARTIST1);
  });

  it('lets an admin update a duel it does not participate in (moderation bypass)', async () => {
    const updated = await duels.updateDuel(duelId, { id: 'system' }, ['admin'], { roomId: 'room-xyz' });
    expect(updated.room_id).toBe('room-xyz');
  });

  it('lets a participant set the live timer fields', async () => {
    const endsAt = new Date(Date.now() + 60000).toISOString();
    const updated = await duels.updateDuel(duelId, { id: ARTIST1 }, [], {
      currentTimerEndsAt: endsAt,
      currentTimerTargetId: ARTIST2,
    });
    expect(updated.current_timer_ends_at).toBeTruthy();
    expect(updated.current_timer_target_id).toBe(ARTIST2);
  });

  it('forbids a participant (non-admin) from rescheduling', async () => {
    await expect(
      duels.updateDuel(duelId, { id: ARTIST1 }, [], { scheduledTime: '2026-02-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('allows an admin to reschedule', async () => {
    const updated = await duels.updateDuel(duelId, { id: ADMIN_ID }, ['admin'], {
      scheduledTime: '2026-02-01T00:00:00.000Z',
    });
    expect(updated.scheduled_time).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('duel request lifecycle', () => {
  it('rejects a request an artist sends to themself', async () => {
    await expect(duels.createDuelRequest(ARTIST1, { opponentId: ARTIST1 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('creates a pending request with defaults', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    expect(req.status).toBe('pending');
    expect(req.requester_id).toBe(ARTIST1);
    expect(req.opponent_id).toBe(ARTIST2);
    expect(req.message).toBeNull();
    expect(req.manager_id).toBeNull();
  });

  it('404s responding to an unknown request', async () => {
    await expect(
      duels.respondDuelRequest('00000000-0000-0000-0000-000000000000', ARTIST2, true),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a responder who is not the opponent', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2, message: 'GO' });
    await expect(duels.respondDuelRequest(req.id, OUTSIDER, true)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('accepting creates a duel between requester and opponent', async () => {
    const req = await duels.createDuelRequest(ARTIST1, {
      opponentId: ARTIST3,
      proposedDate: '2026-03-01T12:00:00.000Z',
      managerId: MANAGER,
    });
    const { request, duel } = await duels.respondDuelRequest(req.id, ARTIST3, true);
    expect(request.status).toBe('accepted');
    expect(duel).toBeTruthy();
    expect(duel.artist1_id).toBe(ARTIST1);
    expect(duel.artist2_id).toBe(ARTIST3);
    expect(duel.manager_id).toBe(MANAGER);
    expect(duel.status).toBe('upcoming');
  });

  it('declining leaves duel null', async () => {
    const req = await duels.createDuelRequest(ARTIST2, { opponentId: ARTIST3 });
    const { request, duel } = await duels.respondDuelRequest(req.id, ARTIST3, false);
    expect(request.status).toBe('declined');
    expect(duel).toBeNull();
  });

  it('rejects responding twice to the same request (conflict)', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    await duels.respondDuelRequest(req.id, ARTIST2, false);
    await expect(duels.respondDuelRequest(req.id, ARTIST2, true)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });
});

describe('changeDuelRequestDate', () => {
  it('404s an unknown request', async () => {
    await expect(
      duels.changeDuelRequestDate('00000000-0000-0000-0000-000000000000', ARTIST1, [], '2026-01-01T00:00:00.000Z'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids an actor who is neither the requester nor an admin', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    await expect(
      duels.changeDuelRequestDate(req.id, OUTSIDER, [], '2026-01-01T00:00:00.000Z'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('lets the requester change the proposed date', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    const updated = await duels.changeDuelRequestDate(req.id, ARTIST1, [], '2026-04-01T00:00:00.000Z');
    expect(new Date(updated.proposed_date).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('lets an admin change the proposed date even when not the requester', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    const updated = await duels.changeDuelRequestDate(req.id, ADMIN_ID, ['admin'], '2026-05-01T00:00:00.000Z');
    expect(new Date(updated.proposed_date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('rejects changing the date once the request is no longer pending', async () => {
    const req = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    await duels.respondDuelRequest(req.id, ARTIST2, false);
    await expect(
      duels.changeDuelRequestDate(req.id, ARTIST1, [], '2026-06-01T00:00:00.000Z'),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });
});

describe('listMyDuelRequests', () => {
  it('returns requests where the user is either requester or opponent, and excludes others', async () => {
    await db.DuelRequest.destroy({ where: {} });
    const asRequester = await duels.createDuelRequest(ARTIST1, { opponentId: ARTIST2 });
    const asOpponent = await duels.createDuelRequest(ARTIST3, { opponentId: ARTIST1 });
    await duels.createDuelRequest(ARTIST2, { opponentId: ARTIST3 });

    const mine = await duels.listMyDuelRequests(ARTIST1);
    const ids = mine.map((r) => r.id);
    expect(ids).toContain(asRequester.id);
    expect(ids).toContain(asOpponent.id);
    expect(mine).toHaveLength(2);
  });
});

describe('listDuels', () => {
  beforeAll(async () => {
    await db.Duel.destroy({ where: {} });
    await db.Duel.bulkCreate([
      { id: '33333333-3333-3333-3333-333333333301', artist1_id: ARTIST1, artist2_id: ARTIST2, manager_id: MANAGER, status: 'upcoming' },
      { id: '33333333-3333-3333-3333-333333333302', artist1_id: ARTIST2, artist2_id: ARTIST3, status: 'live' },
      { id: '33333333-3333-3333-3333-333333333303', artist1_id: ARTIST3, artist2_id: ARTIST1, status: 'ended' },
    ]);
  });

  it('filters by status', async () => {
    const { rows } = await duels.listDuels({ status: 'live' });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('live');
  });

  it('filters by participating artist (either side)', async () => {
    const { rows } = await duels.listDuels({ artistId: ARTIST1 });
    expect(rows.map((r) => r.id).sort()).toEqual(
      ['33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333303'].sort(),
    );
  });

  it('filters by manager', async () => {
    const { rows } = await duels.listDuels({ managerId: MANAGER });
    expect(rows).toHaveLength(1);
    expect(rows[0].manager_id).toBe(MANAGER);
  });

  it('returns a pagination envelope', async () => {
    const { pagination } = await duels.listDuels({});
    expect(pagination).toHaveProperty('limit');
    expect(pagination).toHaveProperty('hasMore');
  });
});

describe('getMyVoteHistory', () => {
  const duelId = '44444444-4444-4444-4444-444444444401';
  beforeAll(async () => {
    // Clear votes left over from the "vote totals" describe block above (shared table).
    await db.DuelVote.destroy({ where: {} });
    await db.Duel.create({ id: duelId, artist1_id: ARTIST1, artist2_id: ARTIST2, status: 'ended' });
  });

  it('returns an empty array when the user never voted', async () => {
    expect(await duels.getMyVoteHistory(OUTSIDER)).toEqual([]);
  });

  it('enriches votes with the duel title and voted-for artist profile', async () => {
    await db.DuelVote.create({ duel_id: duelId, artist_id: ARTIST1, user_id: MANAGER, amount: 12.5 });
    const history = await duels.getMyVoteHistory(MANAGER);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      duel_id: duelId,
      artist_id: ARTIST1,
      amount: 12.5,
      duel_title: 'Artist One vs Artist Two',
    });
    expect(history[0].artist).toMatchObject({ id: ARTIST1, full_name: 'Artist One' });
  });
});

describe('getMyDuelTicket', () => {
  const duelId = '44444444-4444-4444-4444-444444444501';
  beforeAll(async () => {
    await db.Duel.create({ id: duelId, artist1_id: ARTIST1, artist2_id: ARTIST2, status: 'upcoming' });
    await db.DuelTicket.create({ duel_id: duelId, user_id: MANAGER, price_paid: 5, purchased_at: new Date() });
  });

  it('reports no ticket + zero count for an unrelated duel/user pairing', async () => {
    expect(await duels.getMyDuelTicket(duelId, OUTSIDER)).toEqual({ hasTicket: false, count: 1 });
  });

  it('reports a ticket for the purchaser and the total sold count', async () => {
    expect(await duels.getMyDuelTicket(duelId, MANAGER)).toEqual({ hasTicket: true, count: 1 });
  });

  it('supports an anonymous caller (no userId)', async () => {
    expect(await duels.getMyDuelTicket(duelId, null)).toEqual({ hasTicket: false, count: 1 });
  });
});
