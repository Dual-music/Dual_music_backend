import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// `startRecording`/`stopRecording` are called fire-and-forget from
// `setPerformer`/`finalizeRanking`. They're normally a silent no-op in test
// envs (LiveKit/S3 unconfigured), but this dev machine's local `.env` (loaded
// unconditionally by `dotenv/config`) has real credentials, which would make
// them attempt REAL network calls in the background. Stub them out so this
// suite never depends on — or is slowed down by — that environment detail.
vi.mock('../src/services/recording.service.js', () => ({
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  default: {},
}));
// `finalizeRanking` notifies the winner by email; avoid a real SMTP attempt.
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));

import { db } from '../src/models/index.js';
import * as competitions from '../src/services/competition.service.js';

/**
 * @file Competition service tests: lifecycle (draft → published → finished),
 * candidacy (self-apply + manager-added walk-ins gated by a platform setting),
 * review, jury votes, performer/focus control and final ranking. Credit-moving
 * RPCs (`voteCandidate`/`sendGift`/`buyTicket`) call MySQL-only stored
 * procedures and are intentionally NOT exercised here (sqlite has no
 * `callProcedure` support) — they're covered by the container-based CI suite
 * per `vitest.config.js`'s top comment.
 */

const MANAGER = '88888888-8888-8888-8888-888888888801';
const MANAGER2 = '88888888-8888-8888-8888-888888888802';
const ARTIST1 = '88888888-8888-8888-8888-888888888811';
const ARTIST2 = '88888888-8888-8888-8888-888888888812';
const ARTIST3 = '88888888-8888-8888-8888-888888888813';
const FAN = '88888888-8888-8888-8888-888888888821';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: MANAGER, email: 'mgr@x.co', full_name: 'Manager' },
    { id: MANAGER2, email: 'mgr2@x.co', full_name: 'Manager 2' },
    { id: ARTIST1, email: 'a1@x.co', full_name: 'Artist 1' },
    { id: ARTIST2, email: 'a2@x.co', full_name: 'Artist 2' },
    { id: ARTIST3, email: 'a3@x.co', full_name: 'Artist 3' },
    { id: FAN, email: 'fan@x.co', full_name: 'Fan' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

/** Builds a valid `createCompetition` input (the model requires start/end/deadline). */
function baseInput(overrides = {}) {
  return {
    title: 'Battle of the Bands',
    startAt: new Date(Date.now() + 3600_000),
    endAt: new Date(Date.now() + 7200_000),
    applicationDeadline: new Date(Date.now() + 1800_000),
    // The model column is NOT NULL with no DB-level default, and the service
    // writes `input.maxCandidates ?? null` verbatim — omitting it would fail
    // the insert, so every fixture must supply it explicitly.
    maxCandidates: 0,
    ...overrides,
  };
}

describe('createCompetition', () => {
  it('creates a draft competition with sane defaults', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    expect(comp).toMatchObject({
      manager_id: MANAGER,
      status: 'draft',
      mode: 'online',
      is_public_paid: false,
      entry_fee_required: false,
      eligibility_scope: 'all',
    });
    expect(Number(comp.entry_fee_amount)).toBe(0);
    expect(Number(comp.viewer_ticket_price)).toBe(0);
  });

  it('honors explicit overrides (venue, sponsors, eligibility)', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput({
      mode: 'onsite',
      country: 'CI',
      city: 'Abidjan',
      acceptsSponsors: false,
      sponsorSubmissionDeadline: new Date(),
      eligibilityScope: 'country',
      eligibleCountries: 'CI,SN',
    }));
    expect(comp.mode).toBe('onsite');
    expect(comp.country).toBe('CI');
    expect(comp.accepts_sponsors).toBe(false);
    // Sponsor deadline is stripped when sponsors are not accepted.
    expect(comp.sponsor_submission_deadline).toBeNull();
    expect(comp.eligibility_scope).toBe('country');
  });
});

describe('updateCompetition', () => {
  let id;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    id = comp.id;
  });

  it('404s for an unknown competition', async () => {
    await expect(
      competitions.updateCompetition('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [], { title: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-manager, non-admin actor', async () => {
    await expect(
      competitions.updateCompetition(id, { id: FAN }, [], { title: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows the owning manager to update whitelisted fields', async () => {
    const upd = await competitions.updateCompetition(id, { id: MANAGER }, [], { title: 'New Title', rewardAmount: 500 });
    expect(upd.title).toBe('New Title');
    expect(Number(upd.reward_amount)).toBe(500);
  });

  it('allows an admin regardless of ownership', async () => {
    const upd = await competitions.updateCompetition(id, { id: FAN }, ['admin'], { status: 'cancelled' });
    expect(upd.status).toBe('cancelled');
  });
});

describe('publishCompetition', () => {
  it('publishes a draft competition', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    const published = await competitions.publishCompetition(comp.id, { id: MANAGER }, []);
    expect(published.status).toBe('published');
  });

  it('conflicts when publishing a non-draft competition', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    await competitions.publishCompetition(comp.id, { id: MANAGER }, []);
    await expect(competitions.publishCompetition(comp.id, { id: MANAGER }, [])).rejects.toMatchObject({ statusCode: 409 });
  });

  it('forbids a non-manager actor', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    await expect(competitions.publishCompetition(comp.id, { id: FAN }, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('404s for an unknown competition', async () => {
    await expect(
      competitions.publishCompetition('00000000-0000-0000-0000-000000000000', { id: MANAGER }, []),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('applyToCompetition', () => {
  it('creates a pending candidacy', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    const candidate = await competitions.applyToCompetition(ARTIST1, comp.id, { pitch: 'Pick me' });
    expect(candidate).toMatchObject({ competition_id: comp.id, artist_id: ARTIST1, status: 'pending', entry_fee_paid: false });
  });

  it('conflicts on a duplicate application', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    await competitions.applyToCompetition(ARTIST1, comp.id, {});
    await expect(competitions.applyToCompetition(ARTIST1, comp.id, {})).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'already_applied' },
    });
  });

  it('conflicts once the application deadline has passed', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput({ applicationDeadline: new Date(Date.now() - 1000) }));
    await expect(competitions.applyToCompetition(ARTIST1, comp.id, {})).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'deadline_passed' },
    });
  });

  it('conflicts when the competition is not draft/published', async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    await db.Competition.update({ status: 'finished' }, { where: { id: comp.id } });
    await expect(competitions.applyToCompetition(ARTIST1, comp.id, {})).rejects.toMatchObject({ statusCode: 409 });
  });

  it('404s for an unknown competition', async () => {
    await expect(competitions.applyToCompetition(ARTIST1, '00000000-0000-0000-0000-000000000000', {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('addCandidateManually', () => {
  let compId;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
  });

  it('404s for an unknown competition', async () => {
    await expect(
      competitions.addCandidateManually('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [], { artistId: ARTIST3 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-manager actor regardless of the platform setting', async () => {
    await expect(
      competitions.addCandidateManually(compId, { id: FAN }, [], { artistId: ARTIST3 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('is disabled by default (no platform setting row)', async () => {
    await expect(
      competitions.addCandidateManually(compId, { id: MANAGER }, [], { artistId: ARTIST3 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MANUAL_CANDIDATES_DISABLED' });
  });

  describe('once enabled via platform setting', () => {
    let spy;
    beforeAll(async () => {
      await db.PlatformSetting.create({ key: 'manual_candidates_config', value: { enabled: true } });
      // `addCandidateManually` reads this row with `{ raw: true }`. On sqlite (unlike the
      // production MySQL driver) a raw JSON column value comes back as its serialized STRING,
      // not a parsed object, so `settingRow?.value?.enabled` never reads through — the function
      // would report MANUAL_CANDIDATES_DISABLED here regardless of what's actually stored. Spy
      // on that one read to hand back what the production driver would, so the tests below
      // exercise the function's real downstream logic instead of this sqlite-only gap.
      spy = vi.spyOn(db.PlatformSetting, 'findByPk').mockResolvedValue({ value: { enabled: true } });
    });
    afterAll(() => {
      spy.mockRestore();
    });

    it('adds a pre-approved candidate for the manager', async () => {
      const candidate = await competitions.addCandidateManually(compId, { id: MANAGER }, [], { artistId: ARTIST3, pitch: 'Walk-in' });
      expect(candidate).toMatchObject({
        competition_id: compId,
        artist_id: ARTIST3,
        status: 'approved',
        entry_fee_paid: true,
        reviewed_by: MANAGER,
      });
      expect(Number(candidate.entry_fee_amount)).toBe(0);
      expect(candidate.reviewed_at).toBeTruthy();
    });

    it('conflicts when the artist is already a candidate', async () => {
      await expect(
        competitions.addCandidateManually(compId, { id: MANAGER }, [], { artistId: ARTIST3 }),
      ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'already_candidate' } });
    });

    it('allows an admin acting on someone else\'s competition', async () => {
      const candidate = await competitions.addCandidateManually(compId, { id: FAN }, ['admin'], { artistId: ARTIST2 });
      expect(candidate.status).toBe('approved');
    });
  });
});

describe('reviewCandidate', () => {
  let compId;
  let candidateId;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
    const candidate = await competitions.applyToCompetition(ARTIST1, compId, {});
    candidateId = candidate.id;
  });

  it('404s for an unknown candidate', async () => {
    await expect(
      competitions.reviewCandidate('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [], { approve: true }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-manager actor', async () => {
    await expect(
      competitions.reviewCandidate(candidateId, { id: FAN }, [], { approve: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('approves a candidate', async () => {
    const candidate = await competitions.reviewCandidate(candidateId, { id: MANAGER }, [], { approve: true });
    expect(candidate.status).toBe('approved');
    expect(candidate.reviewed_by).toBe(MANAGER);
  });

  it('rejects a candidate with a reason', async () => {
    const other = await competitions.applyToCompetition(ARTIST2, compId, {});
    const candidate = await competitions.reviewCandidate(other.id, { id: MANAGER }, [], { approve: false, rejectionReason: 'Not a fit' });
    expect(candidate.status).toBe('rejected');
    expect(candidate.rejection_reason).toBe('Not a fit');
  });
});

describe('setJuryVotes', () => {
  let compId;
  let candidateId;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
    const candidate = await competitions.applyToCompetition(ARTIST1, compId, {});
    candidateId = candidate.id;
  });

  it('404s for an unknown candidate', async () => {
    await expect(
      competitions.setJuryVotes('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [], 5),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-manager actor', async () => {
    await expect(competitions.setJuryVotes(candidateId, { id: FAN }, [], 5)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sets a truncated, floored jury vote count', async () => {
    const candidate = await competitions.setJuryVotes(candidateId, { id: MANAGER }, [], 7.9);
    expect(candidate.jury_votes).toBe(7);
    const negative = await competitions.setJuryVotes(candidateId, { id: MANAGER }, [], -3);
    expect(negative.jury_votes).toBe(0);
  });

  it('conflicts once the competition is finished', async () => {
    await db.Competition.update({ status: 'finished' }, { where: { id: compId } });
    await expect(competitions.setJuryVotes(candidateId, { id: MANAGER }, [], 1)).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'already_finished' },
    });
  });
});

describe('setPerformer', () => {
  let compId;
  let candidateId;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
    const candidate = await competitions.applyToCompetition(ARTIST1, compId, {});
    candidateId = candidate.id;
  });

  it('404s for an unknown competition', async () => {
    await expect(
      competitions.setPerformer('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [], candidateId, 60),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-manager actor', async () => {
    await expect(competitions.setPerformer(compId, { id: FAN }, [], candidateId, 60)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sets the current performer and duration', async () => {
    const comp = await competitions.setPerformer(compId, { id: MANAGER }, [], candidateId, 90);
    expect(comp.current_performer_id).toBe(candidateId);
    expect(comp.current_performer_duration_sec).toBe(90);
    expect(comp.current_performer_started_at).toBeTruthy();
  });

  it('clears the performer slot when candidateId is null', async () => {
    const comp = await competitions.setPerformer(compId, { id: MANAGER }, [], null);
    expect(comp.current_performer_id).toBeNull();
    expect(comp.current_performer_started_at).toBeNull();
  });
});

describe('setForcedFocus', () => {
  let compId;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
  });

  it('404s for an unknown competition', async () => {
    await expect(
      competitions.setForcedFocus('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [], ARTIST1),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forbids a non-manager actor', async () => {
    await expect(competitions.setForcedFocus(compId, { id: FAN }, [], ARTIST1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sets the forced focus participant', async () => {
    const comp = await competitions.setForcedFocus(compId, { id: MANAGER }, [], ARTIST1);
    expect(comp.forced_focus_participant_id).toBe(ARTIST1);
  });
});

describe('listCandidates / getCompetition / listing helpers', () => {
  let compId;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
    const c1 = await competitions.applyToCompetition(ARTIST1, compId, {});
    const c2 = await competitions.applyToCompetition(ARTIST2, compId, {});
    await db.CompetitionCandidate.update({ status: 'approved', total_votes: 10 }, { where: { id: c1.id } });
    await db.CompetitionCandidate.update({ status: 'approved', total_votes: 5, total_gifts_credits: 20 }, { where: { id: c2.id } });
    await db.CompetitionTicket.create({ competition_id: compId, user_id: FAN, amount_paid: 100, paid_at: new Date() });
  });

  it('ranks candidates by combined score (votes + gifts + jury)', async () => {
    const list = await competitions.listCandidates(compId);
    expect(list).toHaveLength(2);
    // c2: 5 + 20 = 25 > c1: 10 + 0 = 10
    expect(list[0].artist_id).toBe(ARTIST2);
    expect(list[0].artist).toMatchObject({ id: ARTIST2 });
  });

  it('hydrates a competition with its candidates', async () => {
    const comp = await competitions.getCompetition(compId);
    expect(comp.candidates).toHaveLength(2);
  });

  it('404s getCompetition for an unknown id', async () => {
    await expect(competitions.getCompetition('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lists the manager\'s own competitions', async () => {
    const { rows } = await competitions.listMyCompetitions(MANAGER, {});
    expect(rows.some((r) => r.id === compId)).toBe(true);
  });

  it('lists an artist\'s own candidacies with a light competition summary', async () => {
    const list = await competitions.listMyCandidacies(ARTIST1);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].competition).toMatchObject({ id: compId });
  });

  it('reports the caller\'s ticket status', async () => {
    expect(await competitions.getMyTicket(FAN, compId)).toEqual({ hasTicket: true, count: 1 });
    expect(await competitions.getMyTicket(ARTIST1, compId)).toEqual({ hasTicket: false, count: 0 });
  });

  it('lists the distinct competitions a user holds tickets for', async () => {
    expect(await competitions.listMyTickets(FAN)).toContain(compId);
  });

  it('lists competitions, optionally filtered by status', async () => {
    const { rows } = await competitions.listCompetitions({ status: 'draft' });
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
  });
});

describe('finalizeRanking', () => {
  let compId;
  let c1;
  let c2;
  let c3;
  beforeAll(async () => {
    const comp = await competitions.createCompetition(MANAGER, baseInput());
    compId = comp.id;
    c1 = await competitions.applyToCompetition(ARTIST1, compId, {});
    c2 = await competitions.applyToCompetition(ARTIST2, compId, {});
    c3 = await competitions.applyToCompetition(ARTIST3, compId, {});
    await db.CompetitionCandidate.update({ status: 'approved', total_votes: 10 }, { where: { id: c1.id } });
    await db.CompetitionCandidate.update({ status: 'approved', total_votes: 30 }, { where: { id: c2.id } });
    await db.CompetitionCandidate.update({ status: 'approved', total_votes: 20 }, { where: { id: c3.id } });
  });

  it('404s for an unknown competition', async () => {
    await expect(competitions.finalizeRanking('00000000-0000-0000-0000-000000000000', { id: MANAGER }, [])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('forbids a non-manager actor', async () => {
    await expect(competitions.finalizeRanking(compId, { id: FAN }, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('ranks approved candidates by score and marks the competition finished', async () => {
    const ranked = await competitions.finalizeRanking(compId, { id: MANAGER }, []);
    expect(ranked.map((r) => r.artist_id)).toEqual([ARTIST2, ARTIST3, ARTIST1]);
    expect(ranked.map((r) => r.final_rank)).toEqual([1, 2, 3]);

    const comp = await db.Competition.findByPk(compId, { raw: true });
    expect(comp.status).toBe('finished');
    expect(comp.winner_announced_at).toBeTruthy();
  });
});
