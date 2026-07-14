import { Router } from 'express';

import * as replayController from '../controllers/replay.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/replay.validation.js';

/**
 * @file Replays router — mounted at `/api/v1/replays`.
 *
 * Public reads (list, detail, view counter). Authenticated: like toggle, access
 * check. Hosts (artist/manager/admin): create a recording. Owner/staff: edit &
 * delete. Premium unlock lives in the wallet module
 * (`POST /wallet/replays/unlock`).
 *
 * @module routes/replay.routes
 */

export const replayRouter = Router();

replayRouter.get('/', optionalAuth(), validate(v.listQuery), replayController.list);
replayRouter.post('/', authenticate(), requireRole('artist', 'manager', 'admin'), validate(v.create), replayController.create);

replayRouter.get('/:id', optionalAuth(), validate(v.idParam), replayController.getOne);
replayRouter.patch('/:id', authenticate(), validate(v.update), replayController.update);
replayRouter.delete('/:id', authenticate(), validate(v.idParam), replayController.remove);

replayRouter.get('/:id/access', authenticate(), validate(v.idParam), replayController.access);
replayRouter.post('/:id/views', validate(v.idParam), replayController.view);
replayRouter.post('/:id/likes', authenticate(), validate(v.idParam), replayController.toggleLike);

export default replayRouter;
