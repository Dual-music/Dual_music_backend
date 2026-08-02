import { Router } from 'express';

import { sequelize } from '../config/sequelize.js';
import { sendSuccess } from '../utils/apiResponse.js';

import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { blogRouter } from './blog.routes.js';
import { commentRouter } from './comment.routes.js';
import { competitionRouter } from './competition.routes.js';
import { artistConcertRouter, concertRouter } from './concert.routes.js';
import { contentRouter } from './content.routes.js';
import { artistRouter, managerRouter } from './creator.routes.js';
import { duelRouter } from './duel.routes.js';
import { giftRouter } from './gift.routes.js';
import { leaderboardRouter } from './leaderboard.routes.js';
import { lifestyleRouter } from './lifestyle.routes.js';
import { liveRouter } from './live.routes.js';
import { livekitRouter } from './livekit.routes.js';
import { moderationRouter } from './moderation.routes.js';
import { notificationRouter } from './notification.routes.js';
import { paymentsRouter } from './payments.routes.js';
import { recordingRouter } from './recording.routes.js';
import { referralRouter } from './referral.routes.js';
import { replayRouter } from './replay.routes.js';
import { settingsRouter } from './settings.routes.js';
import { sponsorRouter } from './sponsor.routes.js';
import { localStorageRouter } from './localStorage.routes.js';
import { subscriptionRouter } from './subscription.routes.js';
import { uploadRouter } from './upload.routes.js';
import { userRouter } from './user.routes.js';
import { walletRouter } from './wallet.routes.js';
import { withdrawalRouter } from './withdrawal.routes.js';

/**
 * @file API v1 root router.
 *
 * Aggregates every feature module's router under `/api/v1`. Feature routers are
 * added here as modules are delivered (auth, users, wallet, duels, …). Ships
 * today with liveness/readiness probes so the container is orchestratable.
 *
 * @module routes/index
 */

export const apiRouter = Router();

/**
 * Liveness probe — returns 200 as long as the process is up.
 * @name GET /api/v1/health
 */
apiRouter.get('/health', (_req, res) => sendSuccess(res, { status: 'ok', uptime: process.uptime() }));

/**
 * Readiness probe — verifies the database is reachable.
 * @name GET /api/v1/ready
 */
apiRouter.get('/ready', async (_req, res) => {
  await sequelize.authenticate();
  return sendSuccess(res, { status: 'ready' });
});

// --- Feature routers (mounted as modules are delivered) ----------------------
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/artists', artistRouter);
apiRouter.use('/managers', managerRouter);
apiRouter.use('/wallet', walletRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/gifts', giftRouter);
apiRouter.use('/duels', duelRouter);
apiRouter.use('/lifestyle', lifestyleRouter);
apiRouter.use('/blogs', blogRouter);
apiRouter.use('/comments', commentRouter);
apiRouter.use('/lives', liveRouter);
apiRouter.use('/concerts', concertRouter);
apiRouter.use('/artist-concerts', artistConcertRouter);
apiRouter.use('/competitions', competitionRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/livekit', livekitRouter);
apiRouter.use('/moderation', moderationRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/leaderboards', leaderboardRouter);
apiRouter.use('/sponsors', sponsorRouter);
apiRouter.use('/replays', replayRouter);
apiRouter.use('/recordings', recordingRouter);
// Token-authorized local transport — MUST precede the authenticated `/uploads`
// router so unauthenticated PUT/GET-by-token requests aren't rejected by its auth.
apiRouter.use('/uploads/local', localStorageRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/withdrawals', withdrawalRouter);
apiRouter.use('/subscriptions', subscriptionRouter);
apiRouter.use('/referrals', referralRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/admin', adminRouter);

export default apiRouter;
