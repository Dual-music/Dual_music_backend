import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

/**
 * @file Creator (artist & manager) applications and profiles service.
 *
 * Handles the "become an artist/manager" workflow: a fan submits a request
 * (with justification documents stored in S3), an admin reviews it, and on
 * approval the user is granted the corresponding role and a public creator
 * profile is provisioned — mirroring the frontend's validation flow.
 *
 * @module services/creator.service
 */

/**
 * Grants a role to a user if not already present (roles live only in user_roles).
 * @param {string} userId
 * @param {'artist'|'manager'} role
 * @param {import('sequelize').Transaction} tx
 * @returns {Promise<void>}
 */
async function grantRole(userId, role, tx) {
  await db.UserRole.findOrCreate({
    where: { user_id: userId, role },
    defaults: { user_id: userId, role },
    transaction: tx,
  });
}

/**
 * Submits an artist application. A user may only have one pending request.
 * @param {string} userId
 * @param {{ description: string, socialLinks?: object, justificationDocumentUrl?: string }} input
 * @returns {Promise<object>}
 */
export async function applyAsArtist(userId, input) {
  const pending = await db.ArtistRequest.findOne({ where: { user_id: userId, status: 'pending' } });
  if (pending) throw ApiError.conflict('CONFLICT', { details: { reason: 'pending_request_exists' } });
  return db.ArtistRequest.create({
    user_id: userId,
    description: input.description,
    social_links: input.socialLinks ?? {},
    justification_document_url: input.justificationDocumentUrl ?? null,
    status: 'pending',
  });
}

/**
 * Submits a manager application.
 * @param {string} userId
 * @param {{ bio: string, experience: string }} input
 * @returns {Promise<object>}
 */
export async function applyAsManager(userId, input) {
  const pending = await db.ManagerRequest.findOne({ where: { user_id: userId, status: 'pending' } });
  if (pending) throw ApiError.conflict('CONFLICT', { details: { reason: 'pending_request_exists' } });
  return db.ManagerRequest.create({
    user_id: userId,
    bio: input.bio,
    experience: input.experience,
    status: 'pending',
  });
}

/**
 * Lists creator requests (admin), filtered by status, paginated.
 * @param {'artist'|'manager'} kind
 * @param {object} query - Pagination + `status` filter.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listRequests(kind, query) {
  const model = kind === 'artist' ? db.ArtistRequest : db.ManagerRequest;
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  const rows = await model.findAll({ where, order, limit, offset });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Lists the caller's own artist/manager applications, newest first. Replaces
 * the frontend's former `supabase.from('artist_requests'|'manager_requests')
 * .eq('user_id', me)` reads in the RequestTracker.
 * @param {'artist'|'manager'} kind
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listMyRequests(kind, userId) {
  const model = kind === 'artist' ? db.ArtistRequest : db.ManagerRequest;
  return model.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']], raw: true });
}

/**
 * Reviews an artist request. On approval, grants the `artist` role and creates
 * an artist profile (idempotently). All within one transaction.
 * @param {string} requestId
 * @param {string} reviewerId
 * @param {{ approve: boolean, rejectionReason?: string }} decision
 * @returns {Promise<object>} The updated request.
 */
export async function reviewArtistRequest(requestId, reviewerId, decision) {
  const req = await db.sequelize.transaction(async (tx) => {
    const r = await db.ArtistRequest.findByPk(requestId, { transaction: tx });
    if (!r) throw ApiError.notFound('NOT_FOUND');
    if (r.status !== 'pending') throw ApiError.conflict('CONFLICT', { details: { status: r.status } });

    r.status = decision.approve ? 'approved' : 'rejected';
    r.reviewed_by = reviewerId;
    r.reviewed_at = new Date();
    await r.save({ transaction: tx });

    if (decision.approve) {
      await grantRole(r.user_id, 'artist', tx);
      const profile = await db.Profile.findByPk(r.user_id, { transaction: tx });
      await db.ArtistProfile.findOrCreate({
        where: { user_id: r.user_id },
        defaults: {
          user_id: r.user_id,
          stage_name: profile?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          social_links: r.social_links ?? {},
          is_public: true,
        },
        transaction: tx,
      });
    }
    return r;
  });
  // Après commit : notification (in-app + temps réel + push + email) — suivi de la demande.
  void notifyUser({
    userId: req.user_id,
    type: 'artist_request',
    title: decision.approve ? 'Demande approuvée' : 'Demande refusée',
    message: decision.approve
      ? 'Votre demande pour devenir artiste a été approuvée !'
      : 'Votre demande pour devenir artiste a été refusée.',
    data: { request_id: req.id },
    email: true,
    push: true,
  }).catch(() => {});
  return req;
}

/**
 * Reviews a manager request (grants `manager` role + manager profile on approve).
 * @param {string} requestId
 * @param {string} reviewerId
 * @param {{ approve: boolean }} decision
 * @returns {Promise<object>}
 */
export async function reviewManagerRequest(requestId, reviewerId, decision) {
  return db.sequelize.transaction(async (tx) => {
    const req = await db.ManagerRequest.findByPk(requestId, { transaction: tx });
    if (!req) throw ApiError.notFound('NOT_FOUND');
    if (req.status !== 'pending') throw ApiError.conflict('CONFLICT', { details: { status: req.status } });

    req.status = decision.approve ? 'approved' : 'rejected';
    req.reviewed_by = reviewerId;
    req.reviewed_at = new Date();
    await req.save({ transaction: tx });

    if (decision.approve) {
      await grantRole(req.user_id, 'manager', tx);
      const profile = await db.Profile.findByPk(req.user_id, { transaction: tx });
      await db.ManagerProfile.findOrCreate({
        where: { user_id: req.user_id },
        defaults: {
          user_id: req.user_id,
          display_name: profile?.full_name ?? null,
          bio: req.bio,
          experience: req.experience,
          is_public: true,
        },
        transaction: tx,
      });
    }
    return req;
  });
}

/** Fields an artist may update on their artist profile. */
const ARTIST_UPDATABLE = ['stage_name', 'bio', 'avatar_url', 'cover_image_url', 'social_links', 'is_public'];

/**
 * Updates the authenticated artist's profile (creating it if missing).
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>}
 */
export async function updateArtistProfile(userId, patch) {
  const [profile] = await db.ArtistProfile.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId },
  });
  for (const key of ARTIST_UPDATABLE) if (patch[key] !== undefined) profile[key] = patch[key];
  profile.updated_at = new Date();
  await profile.save();
  return profile;
}

/** Fields a manager may update on their manager profile. */
const MANAGER_UPDATABLE = ['display_name', 'bio', 'experience', 'avatar_url', 'cover_image_url', 'social_links', 'is_public'];

/**
 * Updates the authenticated manager's profile (creating it if missing).
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>}
 */
export async function updateManagerProfile(userId, patch) {
  const [profile] = await db.ManagerProfile.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId },
  });
  for (const key of MANAGER_UPDATABLE) if (patch[key] !== undefined) profile[key] = patch[key];
  profile.updated_at = new Date();
  await profile.save();
  return profile;
}

/**
 * Returns the caller's own manager profile (creating an empty one if missing).
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getMyManagerProfile(userId) {
  const [profile] = await db.ManagerProfile.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId },
  });
  return profile;
}

/**
 * Returns a public manager profile identified by user id (or manager-profile id),
 * enriched with the linked account's display name/avatar. Restores the frontend's
 * former `supabase.from('manager_profiles').eq('user_id', id)` public fallback on
 * the artist/creator public profile page.
 *
 * Non-public profiles are only visible to their owner (optionalAuth viewer).
 * @param {string} id - The manager's user id (also matches the profile PK).
 * @param {string|null} [viewerId] - The authenticated caller, when present.
 * @returns {Promise<object>} Manager profile + `full_name`/`avatar_url`.
 * @throws {ApiError} 404 when no matching (visible) manager profile exists.
 */
export async function getPublicManagerProfile(id, viewerId = null) {
  const { Op } = db.Sequelize;
  const profile = await db.ManagerProfile.findOne({
    where: { [Op.or]: [{ user_id: id }, { id }] },
    raw: true,
  });
  if (!profile) throw ApiError.notFound('NOT_FOUND');
  if (!profile.is_public && profile.user_id !== viewerId) throw ApiError.notFound('NOT_FOUND');

  const account = await db.Profile.findByPk(profile.user_id, {
    attributes: ['id', 'full_name', 'avatar_url', 'country_code'],
    raw: true,
  });
  return {
    ...profile,
    full_name: account?.full_name ?? null,
    avatar_url: profile.avatar_url ?? account?.avatar_url ?? null,
    country_code: account?.country_code ?? null,
  };
}

/**
 * Lists public artist profiles (paginated).
 * @param {object} query
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listArtists(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  where.is_public = true;
  const rows = await db.ArtistProfile.findAll({ where, order, limit, offset, raw: true });
  const ids = rows.map((r) => r.user_id).filter(Boolean);
  // Hydrate the display name/avatar (from profiles) + follower count so the
  // public directory has everything the frontend's former multi-join produced.
  const [profiles, followerCounts] = await Promise.all([
    ids.length ? db.Profile.findAll({ where: { id: ids }, attributes: ['id', 'full_name', 'avatar_url'], raw: true }) : [],
    ids.length
      ? db.ArtistFollower.findAll({
          where: { artist_id: ids },
          attributes: ['artist_id', [db.Sequelize.fn('COUNT', db.Sequelize.col('follower_id')), 'count']],
          group: ['artist_id'],
          raw: true,
        })
      : [],
  ]);
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const followById = new Map(followerCounts.map((f) => [f.artist_id, Number(f.count)]));
  const hydrated = rows.map((r) => ({
    ...r,
    full_name: profById.get(r.user_id)?.full_name ?? null,
    avatar_url: r.avatar_url ?? profById.get(r.user_id)?.avatar_url ?? null,
    followers_count: followById.get(r.user_id) ?? 0,
  }));
  return { rows: hydrated, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

export default {
  applyAsArtist,
  applyAsManager,
  listRequests,
  reviewArtistRequest,
  reviewManagerRequest,
  updateArtistProfile,
  updateManagerProfile,
  getMyManagerProfile,
  getPublicManagerProfile,
  listArtists,
};
