import * as adminService from '../services/admin.service.js';
import { storageInfo as getStorageInfo } from '../services/storage/index.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Admin HTTP controllers (thin).
 * @module controllers/admin.controller
 */

/**
 * GET /admin/system/storage — read-only media-storage status for the console.
 * Reports the active driver + whether it is configured (no secrets exposed).
 * Storage is chosen at deploy time via `STORAGE_DRIVER`, so this is informational.
 */
export async function storageInfo(_req, res) {
  return sendSuccess(res, getStorageInfo());
}

/** GET /admin/stats */
export async function stats(_req, res) {
  return sendSuccess(res, await adminService.getStats());
}

/** GET /admin/dashboard — consolidated dashboard data set. */
export async function dashboard(_req, res) {
  return sendSuccess(res, await adminService.getDashboard());
}

/** GET /admin/logs */
export async function logs(req, res) {
  const { rows, pagination } = await adminService.listLogs(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /admin/roles/:userId */
export async function getRoles(req, res) {
  return sendSuccess(res, { roles: await adminService.getUserRoles(req.params.userId) });
}

/** POST /admin/roles/batch */
export async function rolesBatch(req, res) {
  return sendSuccess(res, await adminService.getRolesBatch(req.body.userIds));
}

/** GET /admin/users/search?q= */
export async function searchUsers(req, res) {
  return sendSuccess(res, await adminService.searchUsers(req.query.q));
}

/** GET /admin/users?limit= — profile picker list (admin). */
export async function listUsers(req, res) {
  return sendSuccess(res, await adminService.listUsers({ limit: req.query.limit }));
}

/** POST /admin/profiles/batch — batch profiles with email + ban state (admin). */
export async function profilesBatch(req, res) {
  return sendSuccess(res, await adminService.getProfilesBatch(req.body.userIds));
}

/** GET /admin/dedications?limit= */
export async function dedications(req, res) {
  return sendSuccess(res, await adminService.listGlobalDedications(req.query.limit));
}

/** POST /admin/roles */
export async function assignRole(req, res) {
  const result = await adminService.assignRole({
    userId: req.body.userId,
    role: req.body.role,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, result, { status: 201 });
}

/** DELETE /admin/roles */
export async function revokeRole(req, res) {
  const result = await adminService.revokeRole({
    userId: req.body.userId,
    role: req.body.role,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, result);
}

/** GET /admin/settings */
export async function getSettings(_req, res) {
  return sendSuccess(res, await adminService.getAllSettings());
}

/** GET /admin/settings/:key */
export async function getSetting(req, res) {
  return sendSuccess(res, { key: req.params.key, value: await adminService.getSetting(req.params.key) });
}

/** PUT /admin/settings/:key */
export async function upsertSetting(req, res) {
  const result = await adminService.upsertSetting({
    key: req.params.key,
    value: req.body.value,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, result);
}

/** GET /admin/analytics/revenue?period= */
export async function revenueStats(req, res) {
  return sendSuccess(res, await adminService.getRevenueStats(req.query.period));
}

/** GET /admin/analytics/credit-purchases */
export async function creditPurchaseStats(_req, res) {
  return sendSuccess(res, await adminService.getCreditPurchaseStats());
}

/** GET /admin/analytics/top-earners?period=&limit= */
export async function topEarners(req, res) {
  return sendSuccess(res, await adminService.getTopEarners(req.query.period, req.query.limit));
}

/** GET /admin/analytics/distribution/:id/compare */
export async function compareDistribution(req, res) {
  return sendSuccess(res, await adminService.compareDistribution(req.params.id));
}

/** GET /admin/analytics — platform-wide dashboard analytics. */
export async function analytics(_req, res) {
  return sendSuccess(res, await adminService.getPlatformAnalytics());
}

/** GET /admin/referrals — referral-programme aggregate. */
export async function referrals(_req, res) {
  return sendSuccess(res, await adminService.getReferralsAggregate());
}

/** GET /admin/ledger?limit= — platform-wide financial ledger. */
export async function ledger(req, res) {
  return sendSuccess(res, await adminService.getLedger({ limit: req.query.limit }));
}

/** GET /admin/revenue-distributions?sourceType=&limit= */
export async function revenueDistributions(req, res) {
  return sendSuccess(res, await adminService.getRecentDistributions({ sourceType: req.query.sourceType, limit: req.query.limit }));
}

/** POST /admin/logs — explicit admin audit-log write. */
export async function writeLog(req, res) {
  const result = await adminService.writeLog({
    actionType: req.body.actionType,
    targetType: req.body.targetType,
    targetId: req.body.targetId,
    targetName: req.body.targetName,
    details: req.body.details,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, result, { status: 201 });
}

/** POST /admin/announcements */
export async function broadcastAnnouncement(req, res) {
  const result = await adminService.broadcastAnnouncement({
    title: req.body.title,
    message: req.body.message,
    type: req.body.type,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, result, { status: 201 });
}

/** DELETE /admin/users/:id */
export async function deleteUser(req, res) {
  return sendSuccess(res, await adminService.deleteUser({ userId: req.params.id, adminId: req.user.id, adminName: req.user.email }));
}

/** DELETE /admin/duels/:id */
export async function deleteDuel(req, res) {
  return sendSuccess(res, await adminService.deleteDuel({ id: req.params.id, adminId: req.user.id, adminName: req.user.email }));
}

/** DELETE /admin/lives/:id */
export async function deleteLive(req, res) {
  return sendSuccess(res, await adminService.deleteLive({ id: req.params.id, adminId: req.user.id, adminName: req.user.email }));
}

/** POST /admin/duel-requests/:id/approve */
export async function approveDuelRequest(req, res) {
  const result = await adminService.approveDuelRequest({
    id: req.params.id,
    managerId: req.body.managerId,
    scheduledDate: req.body.scheduledDate,
    ticketPrice: req.body.ticketPrice,
    allowsSponsorAds: req.body.allowsSponsorAds,
    adminId: req.user.id,
    adminName: req.user.email,
  });
  return sendSuccess(res, result, { status: 201 });
}

/** POST /admin/duel-requests/:id/reject */
export async function rejectDuelRequest(req, res) {
  return sendSuccess(res, await adminService.rejectDuelRequest({ id: req.params.id, adminId: req.user.id, adminName: req.user.email }));
}

export default {
  stats,
  logs,
  getRoles,
  dashboard,
  rolesBatch,
  searchUsers,
  listUsers,
  profilesBatch,
  dedications,
  assignRole,
  revokeRole,
  getSettings,
  getSetting,
  upsertSetting,
  revenueStats,
  creditPurchaseStats,
  topEarners,
  compareDistribution,
  analytics,
  referrals,
  ledger,
  revenueDistributions,
  writeLog,
  broadcastAnnouncement,
  deleteUser,
  deleteDuel,
  deleteLive,
  approveDuelRequest,
  rejectDuelRequest,
};
