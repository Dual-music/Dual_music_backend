import { Router } from 'express';

import * as recordingController from '../controllers/recording.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/recording.validation.js';

/**
 * @file Recording control router — mounted at `/api/v1/recordings`.
 *
 * Start/stop a server-side (LiveKit Egress) recording on demand. Restricted to
 * event owners (`artist`/`manager`) + staff; per-event ownership and the admin
 * per-type mode are enforced in the service. Read-only status is open to any
 * authenticated user (so viewers' UIs can reflect recording state if needed).
 *
 * @module routes/recording.routes
 */
export const recordingRouter = Router();

recordingRouter.post('/start', authenticate(), requireRole('artist', 'manager', 'moderator', 'admin'), validate(v.startStop), recordingController.start);
recordingRouter.post('/stop', authenticate(), requireRole('artist', 'manager', 'moderator', 'admin'), validate(v.startStop), recordingController.stop);
recordingRouter.get('/status', authenticate(), validate(v.statusQuery), recordingController.status);

export default recordingRouter;
