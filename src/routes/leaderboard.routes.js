import { Router } from 'express';

import * as leaderboardController from '../controllers/leaderboard.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/leaderboard.validation.js';

/**
 * @file Leaderboards router — mounted at `/api/v1/leaderboards`.
 *
 * Public reads (seasons, ranking, winners); admin-only CRUD for seasons and
 * reward tiers; winners may respond to reward-meeting proposals on their own
 * record.
 *
 * @module routes/leaderboard.routes
 */

export const leaderboardRouter = Router();

// --- Public reads ------------------------------------------------------------
leaderboardRouter.get('/gifts', validate(v.giftEngagement), leaderboardController.giftEngagement);
leaderboardRouter.get('/seasons', leaderboardController.listSeasons);
leaderboardRouter.get('/artists', leaderboardController.allTimeArtists);
leaderboardRouter.get('/donors', leaderboardController.allTimeDonors);
leaderboardRouter.get('/winners', leaderboardController.allWinners);
leaderboardRouter.get('/seasons/:id', validate(v.idParam), leaderboardController.getSeason);
leaderboardRouter.get('/seasons/:id/ranking', optionalAuth(), validate(v.rankingQuery), leaderboardController.ranking);
leaderboardRouter.get('/seasons/:id/live', optionalAuth(), validate(v.rankingQuery), leaderboardController.live);
leaderboardRouter.get('/seasons/:id/winners', validate(v.idParam), leaderboardController.winners);

// --- Admin: seasons ----------------------------------------------------------
leaderboardRouter.post('/seasons', authenticate(), requireRole('admin'), validate(v.createSeason), leaderboardController.createSeason);
leaderboardRouter.patch('/seasons/:id', authenticate(), requireRole('admin'), validate(v.updateSeason), leaderboardController.updateSeason);
leaderboardRouter.delete('/seasons/:id', authenticate(), requireRole('admin'), validate(v.idParam), leaderboardController.deleteSeason);

// --- Admin: rewards ----------------------------------------------------------
leaderboardRouter.post('/seasons/:id/rewards', authenticate(), requireRole('admin'), validate(v.addReward), leaderboardController.addReward);
leaderboardRouter.patch('/rewards/:id', authenticate(), requireRole('admin'), validate(v.updateReward), leaderboardController.updateReward);
leaderboardRouter.delete('/rewards/:id', authenticate(), requireRole('admin'), validate(v.idParam), leaderboardController.deleteReward);

// --- Winners -----------------------------------------------------------------
leaderboardRouter.post('/seasons/:id/winners', authenticate(), requireRole('admin'), validate(v.createWinner), leaderboardController.createWinner);
leaderboardRouter.patch('/winners/:id', authenticate(), requireRole('admin'), validate(v.updateWinner), leaderboardController.updateWinner);
leaderboardRouter.post('/winners/:id/respond', authenticate(), validate(v.respondMeeting), leaderboardController.respondMeeting);
leaderboardRouter.post('/winners/:id/distribute', authenticate(), requireRole('admin'), validate(v.idParam), leaderboardController.distributeReward);
leaderboardRouter.post('/winners/:id/mark-received', authenticate(), validate(v.idParam), leaderboardController.markRewardReceived);
leaderboardRouter.post('/seasons/:id/notify-winners', authenticate(), requireRole('admin'), validate(v.idParam), leaderboardController.notifyWinners);

export default leaderboardRouter;
