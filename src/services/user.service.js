import { Op, QueryTypes } from 'sequelize';

import { db } from '../models/index.js';
import { notifyUser } from '../jobs/notify.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file User & profile domain service.
 *
 * Covers public profile reads, self-profile updates, the heavily-used
 * `get_display_profiles` lookup, currency/UI preferences, and artist follows —
 * faithfully reproducing the corresponding Supabase tables/RPCs the frontend
 * relies on.
 *
 * @module services/user.service
 */

/**
 * Batch lookup of minimal public display info for a set of user ids.
 * Mirrors `supabase.rpc('get_display_profiles', { user_ids })`.
 * @param {string[]} userIds
 * @returns {Promise<Array<{ id: string, full_name: string|null, avatar_url: string|null }>>}
 */
export async function getDisplayProfiles(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const unique = [...new Set(userIds)].slice(0, 500);
  return db.Profile.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'full_name', 'avatar_url'],
    raw: true,
  });
}

/**
 * Returns a user's public profile, enriched with follower count, artist profile
 * (if any) and — when a viewer is provided — whether they follow this user.
 * @param {string} userId
 * @param {string|null} [viewerId]
 * @returns {Promise<object>}
 */
export async function getPublicProfile(userId, viewerId = null) {
  const profile = await db.Profile.findByPk(userId);
  if (!profile) throw ApiError.notFound('NOT_FOUND');

  const [artistProfile, followerCount, isFollowing] = await Promise.all([
    db.ArtistProfile.findOne({ where: { user_id: userId } }),
    db.ArtistFollower.count({ where: { artist_id: userId } }),
    viewerId
      ? db.ArtistFollower.count({ where: { artist_id: userId, follower_id: viewerId } }).then((n) => n > 0)
      : Promise.resolve(false),
  ]);

  return { profile, artistProfile, followerCount, isFollowing };
}

/** Fields a user may update on their own profile (mass-assignment whitelist). */
const PROFILE_UPDATABLE = [
  'full_name', 'avatar_url', 'bio', 'social_links', 'is_public',
  'country_code', 'phone', 'phone_country_code',
];

/**
 * Updates the authenticated user's profile.
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>} The updated profile.
 */
export async function updateOwnProfile(userId, patch) {
  const profile = await db.Profile.findByPk(userId);
  if (!profile) throw ApiError.notFound('NOT_FOUND');
  for (const key of PROFILE_UPDATABLE) {
    if (patch[key] !== undefined) profile[key] = patch[key];
  }
  profile.updated_at = new Date();
  await profile.save();
  return profile;
}

/** Délai de grâce (jours) avant la suppression définitive d'un compte. */
const DELETION_GRACE_DAYS = 20;

/**
 * Programme la suppression du compte à effet différé (now + 20 jours). Réversible via
 * {@link cancelAccountDeletion} tant que la date n'est pas atteinte.
 * @param {string} userId
 * @returns {Promise<{ deletionScheduledAt: Date }>}
 */
export async function requestAccountDeletion(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw ApiError.notFound('NOT_FOUND');
  const scheduled = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  user.deletion_scheduled_at = scheduled;
  user.updated_at = new Date();
  await user.save();
  return { deletionScheduledAt: scheduled };
}

/**
 * Annule une suppression programmée (le compte redevient actif).
 * @param {string} userId
 * @returns {Promise<{ cancelled: boolean }>}
 */
export async function cancelAccountDeletion(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw ApiError.notFound('NOT_FOUND');
  user.deletion_scheduled_at = null;
  user.updated_at = new Date();
  await user.save();
  return { cancelled: true };
}

/**
 * Purge les comptes dont la date de suppression est atteinte : le compte est **banni**
 * (connexion bloquée) et marqué supprimé. L'effacement dur des données (RGPD) reste un
 * traitement admin dédié — le bannissement évite les cascades de clés étrangères risquées.
 * @returns {Promise<{ purged: number }>}
 */
export async function purgeExpiredAccounts() {
  const now = new Date();
  const expired = await db.User.findAll({ where: { deletion_scheduled_at: { [Op.lte]: now } } });
  for (const user of expired) {
    if (user.is_banned) continue;
    user.is_banned = true;
    user.banned_at = now;
    user.banned_reason = 'Compte supprimé par l’utilisateur (délai de grâce écoulé).';
    user.updated_at = now;
    await user.save();
  }
  return { purged: expired.length };
}

/**
 * Sets the user's preferred display currency (upsert).
 * Mirrors `supabase.rpc('set_user_currency', { p_currency })`.
 * @param {string} userId
 * @param {string} currencyCode
 * @returns {Promise<{ currency_code: string }>}
 */
export async function setCurrency(userId, currencyCode) {
  const code = currencyCode.trim().toUpperCase();
  await db.UserCurrencyPreference.upsert({ user_id: userId, currency_code: code, updated_at: new Date() });
  return { currency_code: code };
}

/**
 * Returns the user's preferences (currency + UI), creating none.
 * @param {string} userId
 * @returns {Promise<{ currency: object|null, ui: object|null }>}
 */
export async function getPreferences(userId) {
  const [currency, ui] = await Promise.all([
    db.UserCurrencyPreference.findByPk(userId),
    db.UserUiPreference.findOne({ where: { user_id: userId } }),
  ]);
  return { currency, ui };
}

/**
 * Lists a user's active badges (public), newest first.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function getUserBadges(userId) {
  return db.UserBadge.findAll({
    where: { user_id: userId, is_active: true },
    order: [['earned_at', 'DESC']],
    raw: true,
  });
}

/**
 * Returns the caller's UI preferences row (or null when unset).
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getUiPreferences(userId) {
  return db.UserUiPreference.findOne({ where: { user_id: userId }, raw: true });
}

/** camelCase input key → user_ui_preferences column. */
const UI_PREF_MAP = {
  topDonorMode: 'top_donor_mode',
  topDonorAnimation: 'top_donor_animation',
  reduceAnimations: 'reduce_animations',
  timezone: 'timezone',
};

/**
 * Upserts the caller's UI preferences (creates the row with sane defaults on
 * first write, since all string columns are NOT NULL).
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 * @returns {Promise<object>} The saved preferences row.
 */
export async function setUiPreferences(userId, patch) {
  const [row] = await db.UserUiPreference.findOrCreate({
    where: { user_id: userId },
    defaults: {
      user_id: userId,
      top_donor_mode: 'default',
      top_donor_animation: 'default',
      reduce_animations: false,
      timezone: 'UTC',
    },
  });
  for (const [key, col] of Object.entries(UI_PREF_MAP)) {
    if (patch[key] !== undefined) row[col] = patch[key];
  }
  row.updated_at = new Date();
  await row.save();
  return row;
}

/**
 * Follows an artist (idempotent). A user cannot follow themselves.
 * @param {string} followerId
 * @param {string} artistId
 * @returns {Promise<{ following: boolean }>}
 */
export async function followArtist(followerId, artistId) {
  if (followerId === artistId) throw ApiError.badRequest('BAD_REQUEST');
  const target = await db.Profile.findByPk(artistId);
  if (!target) throw ApiError.notFound('NOT_FOUND');
  const [, created] = await db.ArtistFollower.findOrCreate({
    where: { artist_id: artistId, follower_id: followerId },
    defaults: { artist_id: artistId, follower_id: followerId },
  });
  // Notifie l'artiste d'un nouvel abonné (une seule fois, à la création du suivi).
  if (created) {
    const follower = await db.Profile.findByPk(followerId, { attributes: ['full_name'], raw: true }).catch(() => null);
    void notifyUser({
      userId: artistId,
      type: 'follower',
      title: 'Nouvel abonné 💜',
      message: `${follower?.full_name || 'Un utilisateur'} vous suit désormais.`,
      data: { follower_id: followerId },
      push: true,
    }).catch(() => {});
  }
  return { following: true };
}

/**
 * Unfollows an artist (idempotent).
 * @param {string} followerId
 * @param {string} artistId
 * @returns {Promise<{ following: boolean }>}
 */
export async function unfollowArtist(followerId, artistId) {
  await db.ArtistFollower.destroy({ where: { artist_id: artistId, follower_id: followerId } });
  return { following: false };
}

/**
 * Lists the ids a user follows (for feeds).
 * @param {string} followerId
 * @returns {Promise<string[]>}
 */
export async function getFollowedArtistIds(followerId) {
  const rows = await db.ArtistFollower.findAll({
    where: { follower_id: followerId },
    attributes: ['artist_id'],
    raw: true,
  });
  return rows.map((r) => r.artist_id);
}

/**
 * Consolidated per-user profile-page stats (artist + manager + fan) + the
 * caller's own/managed duels (hydrated with artist names). Replaces the Profile
 * page's client-side aggregations.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getMyStats(userId) {
  const one = (rows) => (rows[0] ?? {});
  const [artistScalars, giftsReceived, votesCast, giftsSent, tickets] = await Promise.all([
    db.sequelize.query(
      `SELECT COALESCE(SUM(amount),0) AS total_votes FROM duel_votes WHERE artist_id = :uid`,
      { replacements: { uid: userId }, type: QueryTypes.SELECT },
    ).then(one),
    db.GiftTransaction.count({ where: { to_user_id: userId } }),
    db.sequelize.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM duel_votes WHERE user_id = :uid`,
      { replacements: { uid: userId }, type: QueryTypes.SELECT },
    ).then(one),
    db.GiftTransaction.count({ where: { from_user_id: userId } }),
    db.DuelTicket.count({ where: { user_id: userId } }),
  ]);

  const myDuelRows = await db.Duel.findAll({
    where: { [Op.or]: [{ artist1_id: userId }, { artist2_id: userId }] },
    attributes: ['id', 'status', 'winner_id', 'scheduled_time', 'artist1_id', 'artist2_id'],
    raw: true,
  });
  const managedRows = await db.Duel.findAll({
    where: { manager_id: userId },
    attributes: ['id', 'status', 'scheduled_time', 'artist1_id', 'artist2_id'],
    raw: true,
  });

  const ids = [...new Set([...myDuelRows, ...managedRows].flatMap((d) => [d.artist1_id, d.artist2_id]).filter(Boolean))];
  const profiles = ids.length
    ? await db.Profile.findAll({ where: { id: ids }, attributes: ['id', 'full_name'], raw: true })
    : [];
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  const hydrate = (d) => ({
    id: d.id,
    status: d.status || 'upcoming',
    scheduled_time: d.scheduled_time,
    artist1_name: nameById.get(d.artist1_id) || 'Artiste 1',
    artist2_name: nameById.get(d.artist2_id) || 'Artiste 2',
  });

  return {
    artistStats: {
      totalVotes: Number(artistScalars.total_votes ?? 0),
      totalGifts: giftsReceived,
      totalDuels: myDuelRows.length,
      wonDuels: myDuelRows.filter((d) => d.winner_id === userId).length,
    },
    managerStats: {
      totalDuelsManaged: managedRows.length,
      activeDuels: managedRows.filter((d) => d.status === 'live').length,
      totalGiftsReceived: giftsReceived,
    },
    fanStats: {
      totalVotesCast: Number(votesCast.total ?? 0),
      totalGiftsSent: giftsSent,
      totalTickets: tickets,
    },
    myDuels: myDuelRows.map(hydrate),
    managedDuels: managedRows.map(hydrate),
  };
}

export default {
  getDisplayProfiles,
  getPublicProfile,
  updateOwnProfile,
  setCurrency,
  getPreferences,
  getUserBadges,
  getUiPreferences,
  setUiPreferences,
  followArtist,
  unfollowArtist,
  getFollowedArtistIds,
  getMyStats,
};
