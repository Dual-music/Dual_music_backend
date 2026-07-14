import { Router } from 'express';

import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/notification.validation.js';

/**
 * @file Notifications router — mounted at `/api/v1/notifications`.
 *
 * Every route is user-scoped (Bearer required): the in-app inbox, read-state,
 * delivery preferences, and Web Push subscription management.
 *
 * @module routes/notification.routes
 */

export const notificationRouter = Router();

notificationRouter.use(authenticate());

notificationRouter.get('/', validate(v.listQuery), notificationController.list);
notificationRouter.get('/unread-count', notificationController.unreadCount);
notificationRouter.get('/preferences', notificationController.getPreferences);
notificationRouter.put('/preferences/email', validate(v.updateEmailPrefs), notificationController.updateEmailPreferences);

notificationRouter.post('/push/subscribe', validate(v.subscribePush), notificationController.subscribePush);
notificationRouter.delete('/push/subscribe', validate(v.unsubscribePush), notificationController.unsubscribePush);

notificationRouter.post('/read-all', notificationController.markAllRead);
notificationRouter.post('/:id/read', validate(v.idParam), notificationController.markRead);
notificationRouter.delete('/:id', validate(v.idParam), notificationController.remove);

export default notificationRouter;
