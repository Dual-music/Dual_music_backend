import { Router } from 'express';

import * as creatorController from '../controllers/creator.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as schemas from '../validations/creator.validation.js';

/**
 * @file Creator routers — mounted at `/api/v1/artists` and `/api/v1/managers`.
 *
 * artists: GET / (list) · POST /requests (apply) · GET /requests (admin) ·
 * POST /requests/:id/review (admin) · PATCH /me (artist profile).
 * managers: POST /requests (apply) · GET /requests (admin) ·
 * POST /requests/:id/review (admin) · GET/PATCH /me (own profile) ·
 * GET /:id (public manager profile by user id).
 *
 * @module routes/creator.routes
 */

export const artistRouter = Router();

artistRouter.get('/', validate(schemas.listRequestsSchema), creatorController.listArtists);
artistRouter.post('/requests', authenticate(), validate(schemas.applyArtistSchema), creatorController.applyArtist);
// Static `/requests/me` must precede the admin `/requests` list + `/requests/:id`.
artistRouter.get('/requests/me', authenticate(), creatorController.myArtistRequests);
artistRouter.get(
  '/requests',
  authenticate(),
  requireRole('admin', 'moderator'),
  validate(schemas.listRequestsSchema),
  creatorController.listArtistRequests,
);
artistRouter.post(
  '/requests/:id/review',
  authenticate(),
  requireRole('admin'),
  validate(schemas.reviewRequestSchema),
  creatorController.reviewArtistRequest,
);
artistRouter.patch(
  '/me',
  authenticate(),
  requireRole('artist'),
  validate(schemas.updateArtistProfileSchema),
  creatorController.updateArtistProfile,
);

export const managerRouter = Router();

managerRouter.post('/requests', authenticate(), validate(schemas.applyManagerSchema), creatorController.applyManager);
managerRouter.get('/requests/me', authenticate(), creatorController.myManagerRequests);
managerRouter.get(
  '/requests',
  authenticate(),
  requireRole('admin', 'moderator'),
  validate(schemas.listRequestsSchema),
  creatorController.listManagerRequests,
);
managerRouter.post(
  '/requests/:id/review',
  authenticate(),
  requireRole('admin'),
  validate(schemas.reviewRequestSchema),
  creatorController.reviewManagerRequest,
);
managerRouter.get('/me', authenticate(), requireRole('manager'), creatorController.myManagerProfile);
managerRouter.patch(
  '/me',
  authenticate(),
  requireRole('manager'),
  validate(schemas.updateManagerProfileSchema),
  creatorController.updateManagerProfile,
);
// Dynamic public read — must stay AFTER the static `/me` and `/requests*` paths.
managerRouter.get('/:id', optionalAuth(), validate(schemas.managerByIdSchema), creatorController.getManagerById);

export default { artistRouter, managerRouter };
