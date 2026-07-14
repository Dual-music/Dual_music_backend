import { Router } from 'express';

import * as subscriptionController from '../controllers/subscription.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/subscription.validation.js';

/**
 * @file Subscriptions router — mounted at `/api/v1/subscriptions`.
 *
 * Public: plans catalog. Authenticated: current subscription, Stripe recurring
 * checkout, cancel-at-period-end. Admin: plans CRUD.
 *
 * @module routes/subscription.routes
 */

export const subscriptionRouter = Router();

// --- Plans catalog -----------------------------------------------------------
subscriptionRouter.get('/plans', subscriptionController.listPlans);
subscriptionRouter.post('/plans', authenticate(), requireRole('admin'), validate(v.createPlan), subscriptionController.createPlan);
subscriptionRouter.patch('/plans/:id', authenticate(), requireRole('admin'), validate(v.updatePlan), subscriptionController.updatePlan);
subscriptionRouter.delete('/plans/:id', authenticate(), requireRole('admin'), validate(v.idParam), subscriptionController.deletePlan);

// --- Fan subscription --------------------------------------------------------
subscriptionRouter.get('/me', authenticate(), subscriptionController.mySubscription);
subscriptionRouter.post('/checkout', authenticate(), validate(v.subscribe), idempotency(), subscriptionController.subscribe);
subscriptionRouter.post('/activate', authenticate(), validate(v.activate), subscriptionController.activate);
subscriptionRouter.post('/cancel', authenticate(), subscriptionController.cancel);

export default subscriptionRouter;
