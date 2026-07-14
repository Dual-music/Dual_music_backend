import { Router } from 'express';

import * as withdrawalController from '../controllers/withdrawal.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/withdrawal.validation.js';

/**
 * @file Withdrawals router — mounted at `/api/v1/withdrawals`.
 *
 * User surface: PIN management + reset, net preview, payout-method CRUD, request
 * a withdrawal, own history. Admin surface: review queue + approve / reject
 * (refund) / complete. Every route requires authentication; admin routes add
 * `requireRole('admin')`.
 *
 * @module routes/withdrawal.routes
 */

export const withdrawalRouter = Router();

withdrawalRouter.use(authenticate());

// --- PIN ---------------------------------------------------------------------
withdrawalRouter.get('/pin', withdrawalController.hasPin);
withdrawalRouter.post('/pin', validate(v.setPin), withdrawalController.setPin);
withdrawalRouter.post('/pin/verify', validate(v.verifyPin), withdrawalController.verifyPin);
withdrawalRouter.post('/pin/reset/request', withdrawalController.requestPinReset);
withdrawalRouter.post('/pin/reset/confirm', validate(v.confirmReset), withdrawalController.confirmPinReset);

// --- Preview -----------------------------------------------------------------
withdrawalRouter.post('/net', validate(v.calcNet), withdrawalController.calculateNet);

// --- Payout methods ----------------------------------------------------------
withdrawalRouter.get('/methods', withdrawalController.listMethods);
withdrawalRouter.post('/methods', validate(v.addMethod), withdrawalController.addMethod);
withdrawalRouter.patch('/methods/:id', validate(v.updateMethod), withdrawalController.updateMethod);
withdrawalRouter.delete('/methods/:id', validate(v.idParam), withdrawalController.deleteMethod);

// --- Requests ----------------------------------------------------------------
withdrawalRouter.get('/me', validate(v.listQuery), withdrawalController.myWithdrawals);
withdrawalRouter.get('/', requireRole('admin'), validate(v.listQuery), withdrawalController.listAll);
withdrawalRouter.post('/', validate(v.requestWithdrawal), idempotency(), withdrawalController.request);

// --- Admin review ------------------------------------------------------------
withdrawalRouter.post('/:id/approve', requireRole('admin'), validate(v.idParam), withdrawalController.approve);
withdrawalRouter.post('/:id/reject', requireRole('admin'), validate(v.idParam), withdrawalController.reject);
withdrawalRouter.post('/:id/complete', requireRole('admin'), validate(v.complete), withdrawalController.complete);

export default withdrawalRouter;
