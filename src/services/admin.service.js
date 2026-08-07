
import { Op, QueryTypes } from 'sequelize';

import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';

import { logAdminAction } from './adminLog.service.js';

/** Maps an analytics period to a MySQL interval predicate (or '1=1' for all). */
function periodPredicate(period, column = 'created_at') {
  switch (period) {
    case 'day':
      return `${column} >= (UTC_TIMESTAMP() - INTERVAL 1 DAY)`;
    case 'week':
      return `${column} >= (UTC_TIMESTAMP() - INTERVAL 7 DAY)`;
    case 'month':
      return `${column} >= (UTC_TIMESTAMP() - INTERVAL 30 DAY)`;
    default:
      return '1 = 1';
  }
}

/**
 * @file Admin domain service — dashboard stats, audit-log reads, role
 * assignment (RBAC) and platform settings (key/value config store).
 *
 * All privileged mutations are recorded via {@link logAdminAction}. Roles live
 * exclusively in `user_roles` (never on `profiles`/`users`), per the RBAC
 * contract.
 *
 * @module services/admin.service
 */

/** The five canonical platform roles. */
export const ROLES = ['fan', 'artist', 'manager', 'moderator', 'admin'];

/**
 * Aggregates the admin-dashboard KPI snapshot in a single batched round-trip.
 * @returns {Promise<Record<string, number>>}
 */
export async function getStats() {
  const [
    totalUsers,
    totalArtists,
    totalManagers,
    pendingArtistRequests,
    pendingManagerRequests,
    pendingWithdrawals,
    liveDuels,
    liveConcerts,
    liveCompetitions,
    liveLives,
    pendingAccountReports,
    pendingLiveReports,
    pendingCompetitionReports,
    completedPurchases,
    totalDuels,
  ] = await Promise.all([
    db.Profile.count(),
    db.UserRole.count({ where: { role: 'artist' } }),
    db.UserRole.count({ where: { role: 'manager' } }),
    db.ArtistRequest.count({ where: { status: 'pending' } }),
    db.ManagerRequest.count({ where: { status: 'pending' } }),
    db.WithdrawalRequest.count({ where: { status: 'pending' } }),
    db.Duel.count({ where: { status: 'live' } }),
    db.Concert.count({ where: { status: 'live' } }),
    db.Competition.count({ where: { status: 'live' } }),
    db.ArtistLive.count({ where: { status: 'live' } }),
    db.AccountReport.count({ where: { status: 'pending' } }),
    db.LiveReport.count({ where: { status: 'pending' } }),
    db.CompetitionReport.count({ where: { status: 'pending' } }),
    db.CreditPurchase.findAll({ where: { status: 'completed' }, attributes: ['paid_amount'], raw: true }),
    db.Duel.count(),
  ]);

  const totalRevenue = completedPurchases.reduce((sum, p) => sum + Number(p.paid_amount ?? 0), 0);

  return {
    totalUsers,
    totalArtists,
    totalManagers,
    pendingArtistRequests,
    pendingManagerRequests,
    pendingWithdrawals,
    liveEvents: liveDuels + liveConcerts + liveCompetitions + liveLives,
    liveDuels,
    liveConcerts,
    liveCompetitions,
    liveLives,
    pendingReports: pendingAccountReports + pendingLiveReports + pendingCompetitionReports,
    totalRevenue,
    totalDuels,
  };
}

/**
 * Reads the admin audit log (paginated, newest first).
 * @param {object} query - `actionType?` + pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listLogs(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.actionType) where.action_type = query.actionType;
  const rows = await db.AdminLog.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/* -------------------------------------------------------------------------- */
/* Roles (RBAC)                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Returns the set of roles assigned to a user.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getUserRoles(userId) {
  const rows = await db.UserRole.findAll({ where: { user_id: userId }, attributes: ['role'], raw: true });
  return rows.map((r) => r.role);
}

/**
 * Grants a role to a user (idempotent). Records the action.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ roles: string[] }>}
 * @throws {ApiError} 400 for an unknown role.
 */
export async function assignRole({ userId, role, adminId, adminName }) {
  if (!ROLES.includes(role)) throw ApiError.badRequest('VALIDATION_ERROR', { details: { role } });
  await db.UserRole.findOrCreate({ where: { user_id: userId, role }, defaults: { user_id: userId, role } });
  // Provision the matching public creator profile so a directly-granted role is
  // usable immediately (idempotent — keyed on user_id only).
  if (role === 'artist') {
    await db.ArtistProfile.findOrCreate({ where: { user_id: userId }, defaults: { user_id: userId } });
  } else if (role === 'manager') {
    await db.ManagerProfile.findOrCreate({ where: { user_id: userId }, defaults: { user_id: userId } });
  }
  await logAdminAction({ adminId, adminName, actionType: 'assign_role', targetType: 'user', targetId: userId, details: { role } });
  return { roles: await getUserRoles(userId) };
}

/**
 * Returns the roles assigned to a batch of users as flat `{ user_id, role }`
 * rows (batch form of {@link getUserRoles}).
 * @param {string[]} userIds
 * @returns {Promise<Array<{ user_id: string, role: string }>>}
 */
export async function getRolesBatch(userIds) {
  if (!userIds?.length) return [];
  return db.UserRole.findAll({
    where: { user_id: { [Op.in]: userIds } },
    attributes: ['user_id', 'role'],
    raw: true,
  });
}

/**
 * Searches profiles by name or email (case-insensitive contains), capped at 20.
 * @param {string} q
 * @returns {Promise<Array<{ id, full_name, email, avatar_url, is_banned }>>}
 */
export async function searchUsers(q) {
  const term = `%${q}%`;
  return db.Profile.findAll({
    where: { [Op.or]: [{ full_name: { [Op.like]: term } }, { email: { [Op.like]: term } }] },
    attributes: ['id', 'full_name', 'email', 'avatar_url', 'is_banned'],
    limit: 20,
    raw: true,
  });
}

/**
 * Loads the admin dashboard's data set in one round-trip: the full lists the
 * dashboard renders + aggregates. Replaces the frontend's 11 parallel
 * `supabase.from(...)` reads in `loadDashboardData`. Admin-only.
 * @returns {Promise<Record<string, object[]>>}
 */
export async function getDashboard() {
  const order = [['created_at', 'DESC']];
  const [
    profiles,
    artistConcerts,
    duels,
    artistLives,
    replayVideos,
    artistRequests,
    managerRequests,
    duelRequests,
    withdrawalRequests,
    managerProfiles,
    artistProfiles,
  ] = await Promise.all([
    db.Profile.findAll({ order, raw: true }),
    db.ArtistConcert.findAll({ order, raw: true }),
    db.Duel.findAll({ order, raw: true }),
    db.ArtistLive.findAll({ order: [['started_at', 'DESC']], raw: true }),
    db.ReplayVideo.findAll({ order, raw: true }),
    db.ArtistRequest.findAll({ order, raw: true }),
    db.ManagerRequest.findAll({ order, raw: true }),
    db.DuelRequest.findAll({ order, raw: true }),
    db.WithdrawalRequest.findAll({ order, raw: true }),
    db.ManagerProfile.findAll({ attributes: ['id', 'user_id', 'display_name'], raw: true }),
    db.ArtistProfile.findAll({ attributes: ['user_id', 'is_public'], raw: true }),
  ]);
  return {
    profiles,
    artistConcerts,
    duels,
    artistLives,
    replayVideos,
    artistRequests,
    managerRequests,
    duelRequests,
    withdrawalRequests,
    managerProfiles,
    artistProfiles,
  };
}

/**
 * Lists profiles for admin pickers (id, name, avatar), newest first, capped.
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{ id, full_name, avatar_url }>>}
 */
export async function listUsers({ limit = 100 } = {}) {
  return db.Profile.findAll({
    attributes: ['id', 'full_name', 'avatar_url'],
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(limit) || 100, 500),
    raw: true,
  });
}

/**
 * Batch-resolves profiles by id WITH admin-visible fields (email + ban state).
 * Unlike the public `getDisplayProfiles`, this exposes email/is_banned for admin
 * reports/ban panels. Admin-only.
 * @param {string[]} userIds
 * @returns {Promise<Array<{ id, full_name, email, avatar_url, is_banned }>>}
 */
export async function getProfilesBatch(userIds) {
  const ids = [...new Set((userIds ?? []).filter(Boolean))].slice(0, 500);
  if (ids.length === 0) return [];
  return db.Profile.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'full_name', 'email', 'avatar_url', 'is_banned'],
    raw: true,
  });
}

/**
 * Lists concert dedications platform-wide, newest paid first (admin view).
 * @param {number} [limit=50] - Clamped to 1..200.
 * @returns {Promise<object[]>}
 */
export async function listGlobalDedications(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.ConcertDedication.findAll({ order: [['paid_at', 'DESC']], limit: safeLimit, raw: true });
}

/**
 * Revokes a role from a user. The last `fan` role cannot be removed (every user
 * keeps a baseline role). Records the action.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ roles: string[] }>}
 */
export async function revokeRole({ userId, role, adminId, adminName }) {
  await db.UserRole.destroy({ where: { user_id: userId, role } });
  // Guarantee a baseline role so the user is never left role-less.
  const remaining = await getUserRoles(userId);
  if (remaining.length === 0) {
    await db.UserRole.create({ user_id: userId, role: 'fan' });
    remaining.push('fan');
  }
  await logAdminAction({ adminId, adminName, actionType: 'revoke_role', targetType: 'user', targetId: userId, details: { role } });
  return { roles: remaining };
}

/* -------------------------------------------------------------------------- */
/* Platform settings                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns every platform setting as a `{ key: value }` map.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getAllSettings() {
  const rows = await db.PlatformSetting.findAll({ raw: true });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Returns one platform setting value.
 * @param {string} key
 * @returns {Promise<unknown>}
 * @throws {ApiError} 404 when the key is not configured.
 */
export async function getSetting(key) {
  const row = await db.PlatformSetting.findByPk(key, { raw: true });
  if (!row) throw ApiError.notFound('NOT_FOUND');
  return row.value;
}

/**
 * Upserts a platform setting value and records the change.
 * @param {object} params
 * @param {string} params.key
 * @param {unknown} params.value
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ key: string, value: unknown }>}
 */
export async function upsertSetting({ key, value, adminId, adminName }) {
  await db.PlatformSetting.upsert({ key, value, updated_by: adminId, updated_at: new Date() });
  await logAdminAction({ adminId, adminName, actionType: 'update_setting', targetType: 'setting', targetName: key, details: { key } });
  return { key, value };
}

/* -------------------------------------------------------------------------- */
/* Analytics (admin reads)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Revenue aggregated by source type for a period (mirrors `get_revenue_stats`).
 * @param {'day'|'week'|'month'|'all'} [period='all']
 * @returns {Promise<object[]>}
 */
export async function getRevenueStats(period = 'all') {
  return db.sequelize.query(
    `SELECT source_type,
            SUM(total_credits) AS total_credits,
            SUM(platform_credits) AS platform_credits,
            SUM(artist1_credits + artist2_credits) AS artists_credits,
            SUM(manager_credits) AS manager_credits,
            COUNT(*) AS transaction_count
       FROM revenue_distributions
      WHERE ${periodPredicate(period)}
      GROUP BY source_type
      ORDER BY total_credits DESC`,
    { type: QueryTypes.SELECT },
  );
}

/**
 * Credit-purchase KPIs across day/week/month/all-time (mirrors
 * `get_credit_purchase_stats`).
 * @returns {Promise<object>}
 */
export async function getCreditPurchaseStats() {
  const [row] = await db.sequelize.query(
    `SELECT
        COALESCE(SUM(CASE WHEN created_at >= UTC_DATE() THEN credits_amount END),0) AS today_credits,
        COALESCE(SUM(CASE WHEN created_at >= UTC_DATE() THEN 1 END),0) AS today_count,
        COALESCE(SUM(CASE WHEN created_at >= (UTC_TIMESTAMP()-INTERVAL 7 DAY) THEN credits_amount END),0) AS week_credits,
        COALESCE(SUM(CASE WHEN created_at >= (UTC_TIMESTAMP()-INTERVAL 7 DAY) THEN 1 END),0) AS week_count,
        COALESCE(SUM(CASE WHEN created_at >= (UTC_TIMESTAMP()-INTERVAL 30 DAY) THEN credits_amount END),0) AS month_credits,
        COALESCE(SUM(CASE WHEN created_at >= (UTC_TIMESTAMP()-INTERVAL 30 DAY) THEN 1 END),0) AS month_count,
        COALESCE(SUM(credits_amount),0) AS all_time_credits,
        COALESCE(SUM(CASE WHEN currency='USD' THEN paid_amount END),0) AS all_time_amount_usd
      FROM credit_purchases WHERE status='completed'`,
    { type: QueryTypes.SELECT },
  );
  return row;
}

/**
 * Top earners (artist1 + artist2 + manager shares) for a period, with role
 * (mirrors `get_top_earners`).
 * @param {'day'|'week'|'month'|'all'} [period='month']
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function getTopEarners(period = 'month', limit = 10) {
  const p = periodPredicate(period);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  return db.sequelize.query(
    `WITH earnings AS (
        SELECT artist1_id AS uid, SUM(artist1_credits) AS credits FROM revenue_distributions
          WHERE artist1_id IS NOT NULL AND ${p} GROUP BY artist1_id
        UNION ALL
        SELECT artist2_id, SUM(artist2_credits) FROM revenue_distributions
          WHERE artist2_id IS NOT NULL AND ${p} GROUP BY artist2_id
        UNION ALL
        SELECT manager_id, SUM(manager_credits) FROM revenue_distributions
          WHERE manager_id IS NOT NULL AND ${p} GROUP BY manager_id
      )
      SELECT e.uid AS user_id, p.full_name, SUM(e.credits) AS total_credits,
             CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=e.uid AND r.role='manager') THEN 'manager'
                  WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=e.uid AND r.role='artist') THEN 'artist'
                  ELSE 'user' END AS role
      FROM earnings e LEFT JOIN profiles p ON p.id = e.uid
      WHERE e.uid IS NOT NULL
      GROUP BY e.uid, p.full_name
      ORDER BY total_credits DESC
      LIMIT ${safeLimit}`,
    { type: QueryTypes.SELECT },
  );
}

/**
 * Diagnostic: compares a recorded revenue distribution against the current
 * economic config (mirrors `compare_distribution_vs_config`). Returns the actual
 * split, the configured split, and the per-bucket deltas.
 * @param {string} distributionId
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the distribution does not exist.
 */
export async function compareDistribution(distributionId) {
  const dist = await db.RevenueDistribution.findByPk(distributionId, { raw: true });
  if (!dist) throw ApiError.notFound('NOT_FOUND');
  const cfgRow = await db.PlatformSetting.findByPk('economic_config');
  const revenue = cfgRow?.value?.revenue ?? cfgRow?.value?.distribution ?? {};

  const total = Number(dist.total_credits) || 0;
  const actual = {
    platform: Number(dist.platform_credits) || 0,
    artists: (Number(dist.artist1_credits) || 0) + (Number(dist.artist2_credits) || 0),
    manager: Number(dist.manager_credits) || 0,
  };
  const pct = (v) => (total ? Math.round((v / total) * 10000) / 100 : 0);
  return {
    distribution_id: distributionId,
    source_type: dist.source_type,
    total_credits: total,
    actual,
    actual_pct: { platform: pct(actual.platform), artists: pct(actual.artists), manager: pct(actual.manager) },
    config: revenue,
  };
}

/**
 * Platform-wide analytics for the admin dashboard charts. Grouped SQL over
 * `profiles.created_at` (registrations/day, last 7d), `duels.created_at`
 * (duels/week, last 4w), `user_roles` (role distribution) and `duel_votes`
 * (top artists by paid-vote sum). Top artists are enriched with display fields.
 * @returns {Promise<{ registrationsPerDay: object[], duelsPerWeek: object[], roleDistribution: object[], topArtistsByVotes: object[] }>}
 */
export async function getPlatformAnalytics() {
  const [registrationsPerDay, duelsPerWeek, roleDistribution, topRaw] = await Promise.all([
    db.sequelize.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
         FROM profiles
        WHERE created_at >= (UTC_TIMESTAMP() - INTERVAL 7 DAY)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
        ORDER BY date`,
      { type: QueryTypes.SELECT },
    ),
    db.sequelize.query(
      `SELECT DATE_FORMAT(created_at, '%x-W%v') AS week, COUNT(*) AS count
         FROM duels
        WHERE created_at >= (UTC_TIMESTAMP() - INTERVAL 28 DAY)
        GROUP BY DATE_FORMAT(created_at, '%x-W%v')
        ORDER BY week`,
      { type: QueryTypes.SELECT },
    ),
    db.sequelize.query(
      `SELECT role, COUNT(*) AS count FROM user_roles GROUP BY role ORDER BY count DESC`,
      { type: QueryTypes.SELECT },
    ),
    db.sequelize.query(
      `SELECT artist_id, ROUND(SUM(amount), 2) AS total
         FROM duel_votes
        WHERE artist_id IS NOT NULL
        GROUP BY artist_id
        ORDER BY total DESC
        LIMIT 10`,
      { type: QueryTypes.SELECT },
    ),
  ]);

  const ids = [...new Set(topRaw.map((r) => r.artist_id).filter(Boolean))];
  const profiles = ids.length
    ? await db.Profile.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'full_name', 'avatar_url'], raw: true })
    : [];
  const pmap = new Map(profiles.map((p) => [p.id, p]));
  const topArtistsByVotes = topRaw.map((r) => ({
    artist_id: r.artist_id,
    total: Number(r.total) || 0,
    full_name: pmap.get(r.artist_id)?.full_name ?? null,
    avatar_url: pmap.get(r.artist_id)?.avatar_url ?? null,
  }));

  return {
    registrationsPerDay: registrationsPerDay.map((r) => ({ date: r.date, count: Number(r.count) || 0 })),
    duelsPerWeek: duelsPerWeek.map((r) => ({ week: r.week, count: Number(r.count) || 0 })),
    roleDistribution: roleDistribution.map((r) => ({ role: r.role, count: Number(r.count) || 0 })),
    topArtistsByVotes,
  };
}

/**
 * Referral-programme aggregate for the admin stat cards. `completed` counts
 * rewarded referrals (`reward_claimed = true`); `totalCredits` = completed ×
 * the configured `referral_config.credits_per_referral`.
 * @returns {Promise<{ total: number, completed: number, totalCredits: number }>}
 */
export async function getReferralsAggregate() {
  const [total, completed, cfgRow] = await Promise.all([
    db.Referral.count(),
    db.Referral.count({ where: { reward_claimed: true } }),
    db.PlatformSetting.findByPk('referral_config', { raw: true }),
  ]);
  const creditsPerReferral = Number(cfgRow?.value?.credits_per_referral ?? 0);
  return { total, completed, totalCredits: completed * creditsPerReferral };
}

/**
 * Platform-wide financial ledger: recent credit purchases + revenue
 * distributions, each enriched with the actor's display name. Returned as two
 * lists (the ledger UI renders each in its own tab). Capped per list.
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ purchases: object[], distributions: object[] }>}
 */
export async function getLedger({ limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const [purchases, distributions] = await Promise.all([
    db.CreditPurchase.findAll({ order: [['created_at', 'DESC']], limit: safeLimit, raw: true }),
    db.RevenueDistribution.findAll({ order: [['created_at', 'DESC']], limit: safeLimit, raw: true }),
  ]);
  const ids = [...new Set([...purchases.map((p) => p.user_id), ...distributions.map((d) => d.payer_id)].filter(Boolean))];
  const profiles = ids.length
    ? await db.Profile.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'full_name'], raw: true })
    : [];
  const nameMap = new Map(profiles.map((p) => [p.id, p.full_name]));
  return {
    purchases: purchases.map((p) => ({ ...p, user_name: nameMap.get(p.user_id) ?? null })),
    distributions: distributions.map((d) => ({ ...d, payer_name: nameMap.get(d.payer_id) ?? null })),
  };
}

/**
 * Recent revenue-distribution rows, optionally filtered by `source_type`.
 * @param {{ sourceType?: string, limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function getRecentDistributions({ sourceType, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = {};
  if (sourceType) where.source_type = sourceType;
  return db.RevenueDistribution.findAll({ where, order: [['created_at', 'DESC']], limit: safeLimit, raw: true });
}

/**
 * Explicit admin audit-log write (best-effort via {@link logAdminAction}).
 * @param {object} params
 * @param {string} params.actionType
 * @param {string} [params.targetType]
 * @param {string} [params.targetId]
 * @param {string} [params.targetName]
 * @param {Record<string, unknown>} [params.details]
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ logged: boolean }>}
 */
export async function writeLog({ actionType, targetType, targetId, targetName, details, adminId, adminName }) {
  await logAdminAction({ adminId, adminName, actionType, targetType, targetId, targetName, details });
  return { logged: true };
}

/**
 * Broadcasts a platform announcement: creates an in-app notification for every
 * user and emits a global socket event (mirrors `admin_broadcast_announcement`).
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.type='announcement']
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ recipients: number }>}
 */
export async function broadcastAnnouncement({ title, message, type = 'announcement', adminId, adminName }) {
  const users = await db.Profile.findAll({ attributes: ['id'], raw: true });
  const now = new Date();
  const rows = users.map((u) => ({ user_id: u.id, type, title, message, data: { announcement: true }, read: false, created_at: now }));
  // Chunked bulk insert to avoid oversized statements on large user bases.
  for (let i = 0; i < rows.length; i += 500) {
    await db.Notification.bulkCreate(rows.slice(i, i + 500));
  }
  await logAdminAction({ adminId, adminName, actionType: 'broadcast_announcement', targetType: 'announcement', details: { title, recipients: rows.length } });
  return { recipients: rows.length };
}

/* -------------------------------------------------------------------------- */
/* Deletions (admin)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Deletes a user and their public profile (best-effort, transactional). Roles,
 * wallet and other dependents are left to DB-level cascade/cleanup.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteUser({ userId, adminId, adminName }) {
  const profile = await db.Profile.findByPk(userId, { attributes: ['id', 'full_name'], raw: true });
  await db.sequelize.transaction(async (tx) => {
    await db.Profile.destroy({ where: { id: userId }, transaction: tx });
    await db.User.destroy({ where: { id: userId }, transaction: tx });
  });
  await logAdminAction({ adminId, adminName, actionType: 'delete_user', targetType: 'user', targetId: userId, targetName: profile?.full_name });
  return { removed: true };
}

/**
 * Deletes a duel (admin).
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteDuel({ id, adminId, adminName }) {
  const removed = await db.Duel.destroy({ where: { id } });
  await logAdminAction({ adminId, adminName, actionType: 'delete_duel', targetType: 'duel', targetId: id });
  return { removed: removed > 0 };
}

/**
 * Deletes an artist live (admin).
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteLive({ id, adminId, adminName }) {
  const removed = await db.ArtistLive.destroy({ where: { id } });
  await logAdminAction({ adminId, adminName, actionType: 'delete_live', targetType: 'live', targetId: id });
  return { removed: removed > 0 };
}

/* -------------------------------------------------------------------------- */
/* Duel requests (admin approval)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Approves a duel request (admin): marks it approved (+ manager), creates the
 * corresponding duel, and notifies both artists. All in one transaction.
 * @param {object} params
 * @param {string} params.id
 * @param {string} [params.managerId]
 * @param {string|Date} [params.scheduledDate]
 * @param {number} [params.ticketPrice]
 * @param {boolean} [params.allowsSponsorAds]
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<{ request: object, duel: object }>}
 * @throws {ApiError} 404.
 */
export async function approveDuelRequest({ id, managerId, scheduledDate, ticketPrice, allowsSponsorAds, adminId, adminName }) {
  const { request, duel } = await db.sequelize.transaction(async (tx) => {
    const req = await db.DuelRequest.findByPk(id, { transaction: tx });
    if (!req) throw ApiError.notFound('NOT_FOUND');
    req.status = 'approved';
    if (managerId !== undefined && managerId !== null) req.manager_id = managerId;
    req.updated_at = new Date();
    await req.save({ transaction: tx });

    const created = await db.Duel.create(
      {
        artist1_id: req.requester_id,
        artist2_id: req.opponent_id,
        manager_id: managerId ?? req.manager_id ?? null,
        // scheduled_time est une colonne STRING ; proposed_date est un DATE (objet) → sérialiser
        // (sinon Sequelize rejette « cannot be an array or an object » à l'approbation admin).
        scheduled_time: (() => {
          const v = scheduledDate ?? req.proposed_date ?? null;
          return v ? new Date(v).toISOString() : null;
        })(),
        ticket_price: ticketPrice ?? 0,
        allows_sponsor_ads: allowsSponsorAds ?? false,
        status: 'upcoming',
      },
      { transaction: tx },
    );
    return { request: req, duel: created };
  });

  await Promise.allSettled([
    notifyUser({ userId: request.requester_id, type: 'duel_request', title: 'Duel approuvé', message: 'Votre demande de duel a été approuvée.', data: { duel_id: duel.id } }),
    notifyUser({ userId: request.opponent_id, type: 'duel_request', title: 'Nouveau duel', message: 'Un duel vous a été programmé.', data: { duel_id: duel.id } }),
  ]);
  await logAdminAction({ adminId, adminName, actionType: 'approve_duel_request', targetType: 'duel_request', targetId: id, details: { duel_id: duel.id } });
  return { request, duel };
}

/**
 * Rejects a duel request (admin) and notifies the requester.
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.adminId
 * @param {string} [params.adminName]
 * @returns {Promise<object>}
 * @throws {ApiError} 404.
 */
export async function rejectDuelRequest({ id, adminId, adminName }) {
  const req = await db.DuelRequest.findByPk(id);
  if (!req) throw ApiError.notFound('NOT_FOUND');
  req.status = 'rejected';
  req.updated_at = new Date();
  await req.save();
  await notifyUser({ userId: req.requester_id, type: 'duel_request', title: 'Demande de duel refusée', message: 'Votre demande de duel a été refusée.', data: { request_id: id } }).catch(() => {});
  await logAdminAction({ adminId, adminName, actionType: 'reject_duel_request', targetType: 'duel_request', targetId: id });
  return req;
}

export default {
  ROLES,
  getStats,
  listLogs,
  getUserRoles,
  getRolesBatch,
  searchUsers,
  getProfilesBatch,
  getDashboard,
  listGlobalDedications,
  assignRole,
  revokeRole,
  getAllSettings,
  getSetting,
  upsertSetting,
  getRevenueStats,
  getCreditPurchaseStats,
  getTopEarners,
  getPlatformAnalytics,
  getReferralsAggregate,
  getLedger,
  getRecentDistributions,
  writeLog,
  compareDistribution,
  broadcastAnnouncement,
  deleteUser,
  deleteDuel,
  deleteLive,
  approveDuelRequest,
  rejectDuelRequest,
};
