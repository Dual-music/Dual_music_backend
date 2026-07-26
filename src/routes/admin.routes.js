import { Router } from 'express';

import * as adminController from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/admin.validation.js';

/**
 * @file Admin router — mounted at `/api/v1/admin`.
 *
 * Every route requires the `admin` role: dashboard stats, audit-log reads, RBAC
 * role assignment, and the platform settings key/value store. Reads of the log
 * are also allowed to `moderator`.
 *
 * @module routes/admin.routes
 */

export const adminRouter = Router();

adminRouter.use(authenticate());

adminRouter.get('/stats', requireRole('admin'), adminController.stats);
adminRouter.get('/dashboard', requireRole('admin'), adminController.dashboard);
adminRouter.get('/logs', requireRole('admin', 'moderator'), validate(v.listLogs), adminController.logs);
adminRouter.post('/logs', requireRole('admin'), validate(v.writeLog), adminController.writeLog);

// --- Users -------------------------------------------------------------------
adminRouter.get('/users', requireRole('admin'), adminController.listUsers);
adminRouter.get('/users/search', requireRole('admin'), validate(v.searchUsers), adminController.searchUsers);
adminRouter.delete('/users/:id', requireRole('admin'), validate(v.idParam), adminController.deleteUser);

// --- Deletions ---------------------------------------------------------------
adminRouter.delete('/duels/:id', requireRole('admin'), validate(v.idParam), adminController.deleteDuel);
adminRouter.delete('/lives/:id', requireRole('admin'), validate(v.idParam), adminController.deleteLive);

// --- Duel requests -----------------------------------------------------------
adminRouter.post('/duel-requests/:id/approve', requireRole('admin'), validate(v.approveDuelRequest), adminController.approveDuelRequest);
adminRouter.post('/duel-requests/:id/reject', requireRole('admin'), validate(v.rejectDuelRequest), adminController.rejectDuelRequest);

// --- Roles -------------------------------------------------------------------
adminRouter.post('/roles/batch', requireRole('admin'), validate(v.rolesBatch), adminController.rolesBatch);
adminRouter.post('/profiles/batch', requireRole('admin'), validate(v.rolesBatch), adminController.profilesBatch);
adminRouter.get('/roles/:userId', requireRole('admin'), validate(v.userIdParam), adminController.getRoles);
adminRouter.post('/roles', requireRole('admin'), validate(v.assignRole), adminController.assignRole);
adminRouter.delete('/roles', requireRole('admin'), validate(v.revokeRole), adminController.revokeRole);

// --- Dedications (platform-wide) ---------------------------------------------
adminRouter.get('/dedications', requireRole('admin'), validate(v.listDedications), adminController.dedications);

// --- Analytics ---------------------------------------------------------------
adminRouter.get('/analytics', requireRole('admin'), adminController.analytics);
adminRouter.get('/analytics/revenue', requireRole('admin'), validate(v.analyticsQuery), adminController.revenueStats);
adminRouter.get('/analytics/credit-purchases', requireRole('admin'), adminController.creditPurchaseStats);
adminRouter.get('/analytics/top-earners', requireRole('admin'), validate(v.topEarnersQuery), adminController.topEarners);
adminRouter.get('/analytics/distribution/:id/compare', requireRole('admin'), validate(v.distributionParam), adminController.compareDistribution);

// --- Referrals / ledger / revenue distributions ------------------------------
adminRouter.get('/referrals', requireRole('admin'), adminController.referrals);
adminRouter.get('/ledger', requireRole('admin'), validate(v.ledgerQuery), adminController.ledger);
adminRouter.get('/revenue-distributions', requireRole('admin'), validate(v.revenueDistributionsQuery), adminController.revenueDistributions);

// --- Announcements -----------------------------------------------------------
adminRouter.post('/announcements', requireRole('admin'), validate(v.announcement), adminController.broadcastAnnouncement);

// --- System (read-only status) -----------------------------------------------
adminRouter.get('/system/storage', requireRole('admin'), adminController.storageInfo);

// --- Platform settings -------------------------------------------------------
adminRouter.get('/settings', requireRole('admin'), adminController.getSettings);
adminRouter.get('/settings/:key', requireRole('admin'), validate(v.keyParam), adminController.getSetting);
adminRouter.put('/settings/:key', requireRole('admin'), validate(v.upsertSetting), adminController.upsertSetting);

export default adminRouter;
