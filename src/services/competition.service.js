import { Op } from 'sequelize';

import { db } from '../models/index.js';
import { notifyUser } from '../jobs/notify.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { callProcedure } from '../utils/procedures.js';

import { startRecording, stopRecording } from './recording.service.js';
import { getDisplayProfiles } from './user.service.js';

/**
 * @file Competitions domain service — manager-orchestrated multi-artist contests:
 * candidacy → selection → live → final ranking → rewards. Reproduces the
 * `competitions` / `competition_candidates` / `competition_votes` /
 * `competition_gifts` / `competition_tickets` surface plus the `publish`,
 * `apply`, `review`, `set_performer`, `finalize_ranking` RPCs. Credit-moving
 * ops (vote/gift/ticket) go through atomic stored procedures (competition.sql).
 *
 * @module services/competition.service
 */

/**
 * Ensures the actor manages the competition (or is admin).
 * @param {any} competition
 * @param {{ id: string }} actor
 * @param {string[]} roles
 */
function assertManager(competition, actor, roles) {
  if (competition.manager_id !== actor.id && !roles.includes('admin')) throw ApiError.forbidden('FORBIDDEN');
}

/**
 * `eligible_countries` is a STRING column (CSV of ISO codes) but both clients send/expect a
 * `string[]` — Sequelize rejects an array outright for a STRING column ("cannot be an array or
 * an object"), which used to block creating/updating ANY competition whose eligibility wasn't
 * scoped to a hand-picked country list (i.e. most "online"/"world"/"africa" competitions, plus
 * any "country" one where no code had been picked yet). Normalize both directions here.
 * @param {unknown} value
 * @returns {string}
 */
function toEligibleCountriesString(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(',');
  return typeof value === 'string' ? value : '';
}

/**
 * @param {Record<string, any>|null} row
 * @returns {Record<string, any>|null}
 */
function withEligibleCountriesArray(row) {
  if (row) row.eligible_countries = row.eligible_countries ? String(row.eligible_countries).split(',').filter(Boolean) : [];
  return row;
}

/**
 * Lists competitions (optionally by status), paginated.
 * @param {object} query
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listCompetitions(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  const rows = await db.Competition.findAll({ where, order, limit, offset, raw: true });
  rows.forEach(withEligibleCountriesArray);
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Returns a competition with its (approved) candidates hydrated with profiles.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getCompetition(id) {
  const competition = await db.Competition.findByPk(id, { raw: true });
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  withEligibleCountriesArray(competition);
  competition.candidates = await listCandidates(id);
  return competition;
}

/**
 * Lists a competition's candidates, hydrated with artist profiles, ranked by
 * live score (votes + gift credits).
 * @param {string} competitionId
 * @returns {Promise<object[]>}
 */
export async function listCandidates(competitionId) {
  const rows = await db.CompetitionCandidate.findAll({
    where: { competition_id: competitionId },
    raw: true,
  });
  // Tri par score combiné (votes payants + cadeaux + voix de jury) — pas juste `total_votes` :
  // sinon le classement affiché en direct au manager ne reflète pas l'effet des voix de jury
  // qu'il vient de saisir, ni des cadeaux reçus.
  rows.sort((a, b) => candidateScore(b) - candidateScore(a));
  const profiles = await getDisplayProfiles(rows.map((r) => r.artist_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, artist: byId.get(r.artist_id) || null }));
}

/** Score combiné d'un candidat : votes payants + cadeaux + voix de jury (manager, hors ligne). */
function candidateScore(candidate) {
  return Number(candidate.total_votes || 0) + Number(candidate.total_gifts_credits || 0) + Number(candidate.jury_votes || 0);
}

/**
 * Creates a draft competition (manager).
 * @param {string} managerId
 * @param {Record<string, unknown>} input
 * @returns {Promise<object>}
 */
export async function createCompetition(managerId, input) {
  const competition = await db.Competition.create({
    manager_id: input.managerId ?? managerId,
    title: input.title,
    description: input.description ?? null,
    mode: input.mode ?? 'online',
    start_at: input.startAt ?? null,
    end_at: input.endAt ?? null,
    application_deadline: input.applicationDeadline ?? null,
    max_candidates: input.maxCandidates ?? null,
    entry_fee_required: input.entryFeeRequired ?? false,
    entry_fee_amount: input.entryFeeAmount ?? 0,
    viewer_ticket_price: input.viewerTicketPrice ?? 0,
    is_public_paid: input.isPublicPaid ?? false,
    reward_amount: input.rewardAmount ?? 0,
    reward_description: input.rewardDescription ?? null,
    // Venue + eligibility (previously stripped on create).
    cover_url: input.coverUrl ?? null,
    country: input.country ?? null,
    city: input.city ?? null,
    commune: input.commune ?? null,
    district: input.district ?? null,
    venue_name: input.venueName ?? null,
    venue_address: input.venueAddress ?? null,
    venue_contact: input.venueContact ?? null,
    eligibility_scope: input.eligibilityScope ?? 'all',
    eligible_countries: toEligibleCountriesString(input.eligibleCountries),
    application_opens_at: input.applicationOpensAt ?? null,
    accepts_sponsors: input.acceptsSponsors ?? true,
    // Deadline sponsor saisie dans le formulaire (uniquement si les sponsors sont acceptés).
    sponsor_submission_deadline: input.acceptsSponsors === false ? null : (input.sponsorSubmissionDeadline ?? null),
    status: 'draft',
  });
  return withEligibleCountriesArray(competition.get({ plain: true }));
}

/** camelCase input key → competitions column, for {@link updateCompetition}. */
const COMPETITION_UPDATABLE = {
  title: 'title',
  description: 'description',
  mode: 'mode',
  startAt: 'start_at',
  endAt: 'end_at',
  applicationDeadline: 'application_deadline',
  maxCandidates: 'max_candidates',
  entryFeeRequired: 'entry_fee_required',
  entryFeeAmount: 'entry_fee_amount',
  viewerTicketPrice: 'viewer_ticket_price',
  isPublicPaid: 'is_public_paid',
  rewardAmount: 'reward_amount',
  rewardDescription: 'reward_description',
  status: 'status',
  // Venue + eligibility (previously stripped on update).
  coverUrl: 'cover_url',
  country: 'country',
  city: 'city',
  commune: 'commune',
  district: 'district',
  venueName: 'venue_name',
  venueAddress: 'venue_address',
  venueContact: 'venue_contact',
  eligibilityScope: 'eligibility_scope',
  eligibleCountries: 'eligible_countries',
  applicationOpensAt: 'application_opens_at',
  acceptsSponsors: 'accepts_sponsors',
  sponsorSubmissionDeadline: 'sponsor_submission_deadline',
  managerId: 'manager_id',
  chatEnabled: 'chat_enabled',
};

/**
 * Updates a competition (owner manager or admin). Also accepts `status`
 * (e.g. `{ status: 'cancelled' }`).
 * @param {string} id
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {Record<string, unknown>} input
 * @returns {Promise<object>}
 * @throws {ApiError} 404 not found · 403 when not the owner/admin.
 */
export async function updateCompetition(id, actor, roles, input) {
  const competition = await db.Competition.findByPk(id);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  assertManager(competition, actor, roles);
  for (const [key, col] of Object.entries(COMPETITION_UPDATABLE)) {
    if (input[key] === undefined) continue;
    // `eligible_countries` est une colonne STRING (CSV) : voir toEligibleCountriesString.
    competition[col] = key === 'eligibleCountries' ? toEligibleCountriesString(input[key]) : input[key];
  }
  competition.updated_at = new Date();
  await competition.save();
  if (input.status !== undefined) {
    emitToRoom('/live', roomName('competition', id), 'status', { competition_id: id, status: competition.status });
  }
  if (input.chatEnabled !== undefined) {
    emitToRoom('/live', roomName('competition', id), 'settings', { competition_id: id, chat_enabled: competition.chat_enabled });
  }
  return withEligibleCountriesArray(competition.get({ plain: true }));
}

/**
 * Lists the caller's own competitions (as manager), all statuses, paginated.
 * @param {string} managerId
 * @param {object} query
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listMyCompetitions(managerId, query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  where.manager_id = managerId;
  if (query.status) where.status = query.status;
  const rows = await db.Competition.findAll({ where, order, limit, offset, raw: true });
  rows.forEach(withEligibleCountriesArray);
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Reports whether the caller holds a ticket for a competition (with count).
 * @param {string} userId
 * @param {string} competitionId
 * @returns {Promise<{ hasTicket: boolean, count: number }>}
 */
export async function getMyTicket(userId, competitionId) {
  const count = await db.CompetitionTicket.count({
    where: { competition_id: competitionId, user_id: userId },
  });
  return { hasTicket: count > 0, count };
}

/**
 * Lists the caller's own competition candidacies (as an artist), newest first,
 * each enriched with a light `competition` object (title/start_at/status) so
 * the artist view can render without extra round-trips.
 * @param {string} artistId
 * @returns {Promise<object[]>}
 */
export async function listMyCandidacies(artistId) {
  const rows = await db.CompetitionCandidate.findAll({
    where: { artist_id: artistId },
    order: [['created_at', 'DESC']],
    raw: true,
  });
  if (!rows.length) return [];
  const compIds = [...new Set(rows.map((r) => r.competition_id))];
  const comps = await db.Competition.findAll({
    where: { id: { [db.Sequelize.Op.in]: compIds } },
    attributes: ['id', 'title', 'start_at', 'status', 'cover_url'],
    raw: true,
  });
  const byId = new Map(comps.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, competition: byId.get(r.competition_id) || null }));
}

/**
 * Returns the distinct competition ids the caller holds a viewer ticket for,
 * so a catalog view can prefill its "already-paid" set in one round-trip.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function listMyTickets(userId) {
  const rows = await db.CompetitionTicket.findAll({
    where: { user_id: userId },
    attributes: ['competition_id'],
    group: ['competition_id'],
    raw: true,
  });
  return rows.map((r) => r.competition_id);
}

/**
 * Publishes a competition (draft → published). Mirrors `publish_competition`.
 * @param {string} id
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @returns {Promise<object>}
 */
export async function publishCompetition(id, actor, roles) {
  const competition = await db.Competition.findByPk(id);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  assertManager(competition, actor, roles);
  if (competition.status !== 'draft') throw ApiError.conflict('CONFLICT', { details: { status: competition.status } });
  competition.status = 'published';
  await competition.save();
  return competition;
}

/**
 * Applies to a competition as a candidate. Mirrors `apply_to_competition`.
 * @param {string} userId
 * @param {string} competitionId
 * @param {{ pitch?: string, videoDemoUrl?: string }} input
 * @returns {Promise<object>}
 */
export async function applyToCompetition(userId, competitionId, input) {
  const competition = await db.Competition.findByPk(competitionId);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  if (!['published', 'draft'].includes(competition.status)) throw ApiError.conflict('CONFLICT');
  if (competition.application_deadline && new Date(competition.application_deadline) < new Date()) {
    throw ApiError.conflict('CONFLICT', { details: { reason: 'deadline_passed' } });
  }
  const existing = await db.CompetitionCandidate.findOne({
    where: { competition_id: competitionId, artist_id: userId },
  });
  if (existing) throw ApiError.conflict('CONFLICT', { details: { reason: 'already_applied' } });

  return db.CompetitionCandidate.create({
    competition_id: competitionId,
    artist_id: userId,
    pitch: input.pitch ?? null,
    video_demo_url: input.videoDemoUrl ?? null,
    status: 'pending',
    entry_fee_amount: competition.entry_fee_amount ?? 0,
    entry_fee_paid: false,
  });
}

/**
 * Adds a candidate directly (manager/admin), bypassing self-application + review — for a
 * walk-in performer at an ONSITE event who has no reason to submit their own candidacy
 * beforehand. Gated by the platform-wide `manual_candidates_config` setting (disabled by
 * default — an explicit admin opt-in, not a per-competition choice).
 * @param {string} competitionId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {{ artistId: string, pitch?: string }} input
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403 · 409 (feature disabled or already a candidate).
 */
export async function addCandidateManually(competitionId, actor, roles, input) {
  const competition = await db.Competition.findByPk(competitionId);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  assertManager(competition, actor, roles);

  const settingRow = await db.PlatformSetting.findByPk('manual_candidates_config', { raw: true }).catch(() => null);
  if (settingRow?.value?.enabled !== true) {
    throw ApiError.forbidden('MANUAL_CANDIDATES_DISABLED');
  }

  const existing = await db.CompetitionCandidate.findOne({
    where: { competition_id: competitionId, artist_id: input.artistId },
  });
  if (existing) throw ApiError.conflict('CONFLICT', { details: { reason: 'already_candidate' } });

  return db.CompetitionCandidate.create({
    competition_id: competitionId,
    artist_id: input.artistId,
    pitch: input.pitch ?? null,
    // Directement approuvé : le manager vient de vérifier physiquement l'artiste (présentiel) —
    // lui faire repasser par la file d'attente de validation n'aurait pas de sens.
    status: 'approved',
    entry_fee_amount: 0,
    entry_fee_paid: true,
    reviewed_by: actor.id,
    reviewed_at: new Date(),
  });
}

/**
 * Reviews a candidate (manager). Mirrors `review_competition_candidate`.
 * @param {string} candidateId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {{ approve: boolean, rejectionReason?: string }} decision
 * @returns {Promise<object>}
 */
export async function reviewCandidate(candidateId, actor, roles, decision) {
  const candidate = await db.CompetitionCandidate.findByPk(candidateId);
  if (!candidate) throw ApiError.notFound('NOT_FOUND');
  const competition = await db.Competition.findByPk(candidate.competition_id);
  assertManager(competition, actor, roles);

  candidate.status = decision.approve ? 'approved' : 'rejected';
  candidate.reviewed_by = actor.id;
  candidate.reviewed_at = new Date();
  if (!decision.approve) candidate.rejection_reason = decision.rejectionReason ?? null;
  await candidate.save();

  await notifyUser({
    userId: candidate.artist_id,
    type: 'competition',
    title: decision.approve ? 'Candidature acceptée 🎉' : 'Candidature refusée',
    message: decision.approve
      ? `Ta candidature pour « ${competition.title} » a été acceptée.`
      : `Ta candidature pour « ${competition.title} » a été refusée${decision.rejectionReason ? ` : ${decision.rejectionReason}` : '.'}`,
    data: { competition_id: competition.id, candidate_id: candidate.id },
    email: true,
  }).catch(() => {});

  return candidate;
}

/**
 * Removes a candidate from a competition (manager) — including one already `approved`.
 * Refunds their entry fee if one was genuinely collected (`entry_fee_paid`), a no-op
 * otherwise (see {@link addCandidateManually}/`applyToCompetition`: today only a manually
 * walk-in candidate can carry a real charge). Notifies the artist either way.
 * @param {string} candidateId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @returns {Promise<{ removed: boolean, refunded: boolean }>}
 * @throws {ApiError} 404 · 403.
 */
export async function removeCandidate(candidateId, actor, roles) {
  const candidate = await db.CompetitionCandidate.findByPk(candidateId);
  if (!candidate) throw ApiError.notFound('NOT_FOUND');
  const competition = await db.Competition.findByPk(candidate.competition_id);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  assertManager(competition, actor, roles);

  const out = await callProcedure(
    'refund_competition_candidate_entry_fee',
    [candidateId],
    ['success', 'code'],
  );
  if (!out.success) throw ApiError.badRequest('CANDIDATE_REMOVE_FAILED', { details: { code: out.code } });
  const refunded = out.code === 'ok';

  candidate.status = 'removed';
  candidate.reviewed_by = actor.id;
  candidate.reviewed_at = new Date();
  await candidate.save();

  await notifyUser({
    userId: candidate.artist_id,
    type: 'competition',
    title: 'Retiré de la compétition',
    message: refunded
      ? `Tu as été retiré de « ${competition.title} ». Tes frais d'inscription t'ont été remboursés.`
      : `Tu as été retiré de « ${competition.title} ».`,
    data: { competition_id: competition.id, candidate_id: candidate.id },
    email: true,
  }).catch(() => {});

  return { removed: true, refunded };
}

/**
 * Nombre de candidatures en attente de validation, toutes compétitions confondues, pour un
 * manager donné — alimente le badge du menu « Candidats » (visible sans avoir à ouvrir chaque
 * compétition une à une).
 * @param {string} managerId
 * @returns {Promise<number>}
 */
export async function countPendingCandidates(managerId) {
  const myCompetitionIds = await db.Competition.findAll({
    where: { manager_id: managerId },
    attributes: ['id'],
    raw: true,
  }).then((rows) => rows.map((r) => r.id));
  if (myCompetitionIds.length === 0) return 0;
  return db.CompetitionCandidate.count({
    where: { status: 'pending', competition_id: { [Op.in]: myCompetitionIds } },
  });
}

/**
 * Sets (absolute value, not increment) a candidate's cumulative jury votes — a manager-entered
 * tally from an offline jury, distinct from paid online votes/gifts, added to both sources in
 * the live standings ({@link listCandidates}) and the final ranking ({@link finalizeRanking}).
 * Works the same for `online` and `onsite` competitions. Blocked once the competition is
 * `finished` (ranking already locked by {@link finalizeRanking}).
 * @param {string} candidateId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {number} juryVotes
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 403 · 409 if the competition is already finished.
 */
export async function setJuryVotes(candidateId, actor, roles, juryVotes) {
  const candidate = await db.CompetitionCandidate.findByPk(candidateId);
  if (!candidate) throw ApiError.notFound('NOT_FOUND');
  const competition = await db.Competition.findByPk(candidate.competition_id);
  assertManager(competition, actor, roles);
  if (competition.status === 'finished') throw ApiError.conflict('CONFLICT', { details: { reason: 'already_finished' } });
  candidate.jury_votes = Math.max(0, Math.trunc(juryVotes));
  await candidate.save();
  // Resynchronise le classement en direct chez tous (spectateurs + manager) — même canal que
  // les cadeaux/votes, pour que l'effet des voix de jury soit visible immédiatement.
  emitToRoom('/live', roomName('competition', candidate.competition_id), 'candidates:updated', {
    competitionId: candidate.competition_id,
  });
  return candidate;
}

/**
 * Sets the currently-performing candidate. Mirrors `set_competition_performer`.
 * @param {string} competitionId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {string|null} candidateId
 * @param {number} [durationSec]
 * @returns {Promise<object>}
 */
export async function setPerformer(competitionId, actor, roles, candidateId, durationSec) {
  const competition = await db.Competition.findByPk(competitionId);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  assertManager(competition, actor, roles);
  competition.current_performer_id = candidateId;
  competition.current_performer_started_at = candidateId ? new Date() : null;
  if (durationSec !== undefined) competition.current_performer_duration_sec = durationSec;
  await competition.save();
  emitToRoom('/live', roomName('competition', competitionId), 'performer', {
    competitionId,
    performerId: candidateId,
    durationSec: competition.current_performer_duration_sec,
  });
  // Egress PAR SLOT : chaque performance devient un replay. On clôt le slot précédent puis on
  // démarre le nouveau (séquencé pour éviter la course d'idempotence). No-op si egress off /
  // mode 'off'. Un slot vide (candidateId=null) ne fait qu'arrêter.
  const performerArtistId = candidateId
    ? (await db.CompetitionCandidate.findByPk(candidateId, { attributes: ['artist_id'], raw: true }).catch(() => null))?.artist_id
    : null;
  void (async () => {
    await stopRecording({ sourceType: 'competition', sourceId: competitionId }).catch(() => {});
    if (candidateId) {
      await startRecording({
        sourceType: 'competition',
        sourceId: competitionId,
        artistId: performerArtistId,
        createdBy: actor.id,
        allowedModes: ['auto', 'manual'],
      }).catch(() => {});
    }
  })();
  return competition;
}

/**
 * Sets the forced camera focus participant (broadcast via realtime).
 * @param {string} competitionId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @param {string|null} participantId
 * @returns {Promise<object>}
 */
export async function setForcedFocus(competitionId, actor, roles, participantId) {
  const competition = await db.Competition.findByPk(competitionId);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  assertManager(competition, actor, roles);
  competition.forced_focus_participant_id = participantId;
  await competition.save();
  // Broadcast forced camera focus to all viewers (spec §3.4).
  emitToRoom('/live', roomName('competition', competitionId), 'focus', { competitionId, participantId });
  return competition;
}

/**
 * Finalizes the ranking: orders candidates by (votes + gift credits), assigns
 * `final_rank`, and marks the competition finished. Mirrors
 * `finalize_competition_ranking`.
 * @param {string} competitionId
 * @param {{ id: string }} actor
 * @param {string[]} roles
 * @returns {Promise<object[]>} Ranked candidates.
 */
export async function finalizeRanking(competitionId, actor, roles) {
  const candidates = await db.sequelize.transaction(async (tx) => {
    const competition = await db.Competition.findByPk(competitionId, { transaction: tx });
    if (!competition) throw ApiError.notFound('NOT_FOUND');
    assertManager(competition, actor, roles);

    const list = await db.CompetitionCandidate.findAll({
      where: { competition_id: competitionId, status: 'approved' },
      transaction: tx,
    });
    list.sort((a, b) => candidateScore(b) - candidateScore(a));
    for (let i = 0; i < list.length; i += 1) {
      list[i].final_rank = i + 1;
      await list[i].save({ transaction: tx });
    }
    competition.status = 'finished';
    competition.winner_announced_at = new Date();
    await competition.save({ transaction: tx });
    return list;
  });
  // Diffuse la clôture à toute la room (spectateurs) : déclenche l'animation « vainqueur »
  // côté clients, avec l'artiste rang 1.
  const winner = candidates[0];
  emitToRoom('/live', roomName('competition', competitionId), 'status', {
    competition_id: competitionId,
    status: 'finished',
    winner_id: winner?.artist_id ?? null,
  });
  // Clôt un éventuel slot d'enregistrement encore actif.
  void stopRecording({ sourceType: 'competition', sourceId: competitionId }).catch(() => {});
  // Après clôture : notifie le vainqueur (rang 1).
  if (winner?.artist_id) {
    void notifyUser({
      userId: winner.artist_id,
      type: 'competition_result',
      title: 'Vous avez remporté la compétition 🏆',
      message: 'Félicitations, vous êtes 1er du classement final !',
      data: { competition_id: competitionId },
      email: true,
      push: true,
    }).catch(() => {});
  }
  return candidates;
}

/**
 * Casts a paid vote for a candidate (atomic procedure).
 * @param {string} voterId
 * @param {{ competitionId: string, candidateId: string, credits: number }} input
 * @returns {Promise<{ success: true }>}
 */
export async function voteCandidate(voterId, { competitionId, candidateId, credits }) {
  const out = await callProcedure(
    'competition_vote',
    [voterId, competitionId, candidateId, credits],
    ['success', 'code'],
  );
  if (!out.success) throw out.code === 'insufficient_balance' ? ApiError.badRequest('WALLET_INSUFFICIENT') : ApiError.badRequest('BAD_REQUEST', { details: { code: out.code } });
  // Resynchronise le classement en direct chez tous (spectateurs + manager) — même canal que les
  // voix de jury/cadeaux — sinon le score du candidat et les points du meilleur donateur ne
  // bougent que pour le votant, jusqu'à une actualisation manuelle des autres.
  emitToRoom('/live', roomName('competition', competitionId), 'candidates:updated', { competitionId });
  return { success: true };
}

/**
 * Sends a paid gift within a competition. The recipient is either a candidate
 * (feeds the ranking tally) or the competition manager (`recipientUserId`, an
 * in-person tip distributed to the manager via the revenue engine). Exactly one
 * of `candidateId` / `recipientUserId` must be provided; a manager recipient is
 * validated against the competition's `manager_id`.
 * @param {string} senderId
 * @param {{ competitionId: string, candidateId?: string, recipientUserId?: string, giftId: string, credits: number }} input
 * @returns {Promise<{ success: true }>}
 */
export async function sendGift(senderId, { competitionId, candidateId, recipientUserId, giftId, credits }) {
  if (recipientUserId) {
    const competition = await db.Competition.findByPk(competitionId, { attributes: ['id', 'manager_id'], raw: true });
    if (!competition) throw ApiError.notFound('NOT_FOUND');
    if (competition.manager_id !== recipientUserId) throw ApiError.badRequest('BAD_REQUEST', { details: { code: 'not_competition_manager' } });
  }
  const out = await callProcedure(
    'send_competition_gift',
    [senderId, competitionId, candidateId ?? null, giftId, credits, recipientUserId ?? null],
    ['success', 'code'],
  );
  if (!out.success) throw out.code === 'insufficient_balance' ? ApiError.badRequest('WALLET_INSUFFICIENT') : ApiError.badRequest('BAD_REQUEST', { details: { code: out.code } });
  // Diffuse l'animation `gift` à toute la room compétition (parité live/duel/concert : le
  // burst central s'affiche pour tous les spectateurs). Les gifts live passent par wallet.service,
  // mais la compétition a sa propre procédure → on émet ici. Inclut le nom/l'avatar de
  // l'EXPÉDITEUR (et le nom/image du cadeau) — même correctif que `wallet.service.js#sendGift` :
  // sans ça, seul `from_user_id` était diffusé et l'animation ne montrait aucune attribution.
  const [giftInfo, senderProfile] = await Promise.all([
    db.VirtualGift.findByPk(giftId, { attributes: ['name', 'image_url'], raw: true }),
    db.Profile.findByPk(senderId, { attributes: ['full_name', 'avatar_url'], raw: true }),
  ]);
  emitToRoom('/live', roomName('competition', competitionId), 'gift', {
    to_user_id: candidateId ?? recipientUserId ?? null,
    from_user_id: senderId,
    value: credits,
    gift_name: giftInfo?.name ?? null,
    gift_image: giftInfo?.image_url ?? null,
    from_user_name: senderProfile?.full_name ?? null,
    from_user_avatar: senderProfile?.avatar_url ?? null,
  });
  // Un cadeau à un candidat alimente son score de classement (pas un pourboire au manager) —
  // même resynchronisation que les votes/voix de jury pour que le classement et les points du
  // meilleur donateur bougent chez tout le monde sans actualisation.
  if (candidateId) {
    emitToRoom('/live', roomName('competition', competitionId), 'candidates:updated', { competitionId });
  }
  return { success: true };
}

/**
 * Buys a viewer ticket for a competition (atomic procedure).
 * @param {string} userId
 * @param {string} competitionId
 * @returns {Promise<{ success: true, ticketId: string }>}
 */
export async function buyTicket(userId, competitionId) {
  const competition = await db.Competition.findByPk(competitionId);
  if (!competition) throw ApiError.notFound('NOT_FOUND');
  const out = await callProcedure(
    'purchase_competition_ticket',
    [userId, competitionId, Number(competition.viewer_ticket_price || 0)],
    ['success', 'code', 'ticket'],
  );
  if (!out.success) {
    if (out.code === 'insufficient_balance') throw ApiError.badRequest('WALLET_INSUFFICIENT');
    if (out.code === 'already_purchased') throw ApiError.conflict('ALREADY_TICKETED');
    throw ApiError.badRequest('BAD_REQUEST', { details: { code: out.code } });
  }
  return { success: true, ticketId: out.ticket };
}

export default {
  listCompetitions,
  getCompetition,
  listCandidates,
  createCompetition,
  updateCompetition,
  listMyCompetitions,
  getMyTicket,
  listMyCandidacies,
  listMyTickets,
  publishCompetition,
  applyToCompetition,
  addCandidateManually,
  reviewCandidate,
  removeCandidate,
  countPendingCandidates,
  setJuryVotes,
  setPerformer,
  setForcedFocus,
  finalizeRanking,
  voteCandidate,
  sendGift,
  buyTicket,
};
