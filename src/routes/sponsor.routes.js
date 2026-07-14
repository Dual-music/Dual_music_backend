import { Router } from 'express';

import * as sponsorController from '../controllers/sponsor.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/sponsor.validation.js';

/**
 * @file Sponsors router — mounted at `/api/v1/sponsors`.
 *
 * Public: price-tier grid. Authenticated users: submit + pay sponsor requests.
 * Admins: tier CRUD + request review. Event hosts (artist/manager) + admins:
 * trigger/stop live ad broadcasts. Payment idempotency is enforced by the
 * `pay_sponsor_from_wallet` procedure (a paid request is a safe no-op).
 *
 * @module routes/sponsor.routes
 */

export const sponsorRouter = Router();

// --- Price tiers -------------------------------------------------------------
sponsorRouter.get('/tiers', sponsorController.listTiers);
sponsorRouter.get('/default-price', validate(v.defaultPriceQuery), sponsorController.defaultPrice);
sponsorRouter.post('/tiers', authenticate(), requireRole('admin'), validate(v.createTier), sponsorController.createTier);
sponsorRouter.patch('/tiers/:id', authenticate(), requireRole('admin'), validate(v.updateTier), sponsorController.updateTier);
sponsorRouter.delete('/tiers/:id', authenticate(), requireRole('admin'), validate(v.idParam), sponsorController.deleteTier);

// --- Requests ----------------------------------------------------------------
sponsorRouter.get('/requests', authenticate(), requireRole('admin'), validate(v.listRequests), sponsorController.listRequests);
sponsorRouter.get('/requests/me', authenticate(), sponsorController.myRequests);
sponsorRouter.post('/requests', authenticate(), validate(v.createRequest), sponsorController.createRequest);
sponsorRouter.post('/requests/:id/pay', authenticate(), validate(v.idParam), idempotency(), sponsorController.payRequest);
sponsorRouter.patch('/requests/:id/review', authenticate(), requireRole('admin'), validate(v.reviewRequest), sponsorController.reviewRequest);
sponsorRouter.patch('/requests/:id/price', authenticate(), requireRole('admin'), validate(v.setPrice), sponsorController.setRequestPrice);
sponsorRouter.patch('/requests/:id/approve-reuse', authenticate(), requireRole('admin'), validate(v.approveReuse), sponsorController.approveReuseMedia);

// --- Submission deadline (admin) ---------------------------------------------
sponsorRouter.patch('/deadline', authenticate(), requireRole('admin'), validate(v.setDeadline), sponsorController.setDeadline);

// --- Ad videos (admin CRUD) --------------------------------------------------
sponsorRouter.get('/ad-videos', authenticate(), requireRole('admin'), sponsorController.listAllAdVideos);
sponsorRouter.post('/ad-videos', authenticate(), requireRole('admin'), validate(v.createAdVideo), sponsorController.createAdVideo);
sponsorRouter.patch('/ad-videos/:id', authenticate(), requireRole('admin'), validate(v.updateAdVideo), sponsorController.updateAdVideo);

// --- Live ad broadcast -------------------------------------------------------
sponsorRouter.get('/ads', authenticate(), validate(v.adVideosQuery), sponsorController.listAdVideos);
sponsorRouter.get('/ads/history', authenticate(), validate(v.adVideosQuery), sponsorController.adHistory);
sponsorRouter.post('/ads/play', authenticate(), requireRole('artist', 'manager', 'admin'), validate(v.startAd), sponsorController.startAd);
sponsorRouter.post('/ads/plays/:id/stop', authenticate(), requireRole('artist', 'manager', 'admin'), validate(v.idParam), sponsorController.stopAd);

export default sponsorRouter;
