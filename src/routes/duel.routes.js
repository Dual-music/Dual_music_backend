import { Router } from 'express';

import * as duelController from '../controllers/duel.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as schemas from '../validations/duel.validation.js';

import { attachChatRoutes } from './chat.helper.js';

/**
 * @file Duels router — mounted at `/api/v1/duels`.
 *
 * | Method | Path | Auth |
 * | --- | --- | --- |
 * | GET | / | public |
 * | POST | / | admin/manager |
 * | GET | /votes/batch | public |
 * | GET | /requests/mine | Bearer |
 * | POST | /requests | Bearer (artist) |
 * | POST | /requests/:id/respond | Bearer |
 * | GET | /:id | public |
 * | PATCH | /:id | participant/admin |
 * | GET | /:id/votes | public |
 * | GET/POST/DELETE | /:id/messages[...] | chat (see chat.helper) |
 *
 * @module routes/duel.routes
 */

export const duelRouter = Router();

// Static/collection routes first (before dynamic `/:id`).
duelRouter.get('/', validate(schemas.listSchema), duelController.list);
duelRouter.get('/batch', duelController.batch);
duelRouter.post('/', authenticate(), requireRole('admin', 'manager'), validate(schemas.createSchema), duelController.create);

duelRouter.get('/requests/mine', authenticate(), duelController.myRequests);
duelRouter.get('/votes/batch', duelController.votesBatch);
duelRouter.get('/votes/mine', authenticate(), duelController.myVotes);
duelRouter.post('/requests', authenticate(), validate(schemas.requestSchema), duelController.createRequest);
duelRouter.post('/requests/:id/respond', authenticate(), validate(schemas.respondSchema), duelController.respondRequest);
duelRouter.patch('/requests/:id', authenticate(), validate(schemas.changeDateSchema), duelController.changeRequestDate);

duelRouter.get('/:id', optionalAuth(), validate(schemas.idParam), duelController.getOne);
duelRouter.patch('/:id', authenticate(), validate(schemas.updateSchema), duelController.update);
duelRouter.get('/:id/votes', validate(schemas.idParam), duelController.votes);
duelRouter.get('/:id/my-ticket', optionalAuth(), validate(schemas.idParam), duelController.myTicket);

attachChatRoutes(duelRouter, 'duel');

export default duelRouter;
