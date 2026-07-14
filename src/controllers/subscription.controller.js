import * as subscriptionService from '../services/subscription.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Subscriptions HTTP controllers (thin).
 * @module controllers/subscription.controller
 */

/** GET /subscriptions/plans */
export async function listPlans(req, res) {
  return sendSuccess(res, await subscriptionService.listPlans(req.query.all !== 'true'));
}

/** POST /subscriptions/plans (admin) */
export async function createPlan(req, res) {
  return sendSuccess(res, await subscriptionService.createPlan(req.body), { status: 201 });
}

/** PATCH /subscriptions/plans/:id (admin) */
export async function updatePlan(req, res) {
  return sendSuccess(res, await subscriptionService.updatePlan(req.params.id, req.body));
}

/** DELETE /subscriptions/plans/:id (admin) */
export async function deletePlan(req, res) {
  return sendSuccess(res, await subscriptionService.deletePlan(req.params.id));
}

/** GET /subscriptions/me */
export async function mySubscription(req, res) {
  return sendSuccess(res, await subscriptionService.getMySubscription(req.user.id));
}

/** POST /subscriptions/checkout */
export async function subscribe(req, res) {
  return sendSuccess(res, await subscriptionService.subscribe(req.user.id, req.body.plan), { status: 201 });
}

/** POST /subscriptions/activate — direct (free/manual) tier activation. */
export async function activate(req, res) {
  return sendSuccess(res, await subscriptionService.activate(req.user.id, req.body.plan), { status: 201 });
}

/** POST /subscriptions/cancel */
export async function cancel(req, res) {
  return sendSuccess(res, await subscriptionService.cancel(req.user.id));
}

export default { listPlans, createPlan, updatePlan, deletePlan, mySubscription, subscribe, activate, cancel };
