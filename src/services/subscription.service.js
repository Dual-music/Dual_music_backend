import { db } from '../models/index.js';
import { initStripeSubscription } from '../services/payments/payments.service.js';
import { getStripe } from '../services/payments/providers/stripe.client.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @file Subscriptions domain service.
 *
 * Two layers:
 *  - **Plans catalog** (`subscription_plans`) — admin-managed display tiers
 *    (Free / Pro / Premium) with `features`, `rules`, price and ordering,
 *    surfaced to the pricing UI.
 *  - **Fan subscriptions** (`fan_subscriptions`) — the user's active tier.
 *    Billing runs through Stripe recurring checkout (`initStripeSubscription`);
 *    the Stripe webhook activates/renews the row. Cancellation is scheduled at
 *    period end via the Stripe API and reflected locally.
 *
 * @module services/subscription.service
 */

/* -------------------------------------------------------------------------- */
/* Plans catalog                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Lists subscription plans in display order.
 * @param {boolean} [activeOnly=true]
 * @returns {Promise<object[]>}
 */
export async function listPlans(activeOnly = true) {
  const where = activeOnly ? { is_active: true } : {};
  return db.SubscriptionPlan.findAll({ where, order: [['sort_order', 'ASC'], ['created_at', 'ASC']], raw: true });
}

/** Creates a plan (admin). @param {object} input @returns {Promise<object>} */
export async function createPlan(input) {
  return db.SubscriptionPlan.create({
    name: input.name,
    description: input.description ?? null,
    price: input.price ?? 0,
    currency: input.currency ?? 'EUR',
    features: input.features ?? [],
    rules: input.rules ?? {},
    icon: input.icon ?? null,
    gradient: input.gradient ?? null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
  });
}

/**
 * Updates a plan (admin, whitelisted fields).
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404.
 */
export async function updatePlan(id, patch) {
  const plan = await db.SubscriptionPlan.findByPk(id);
  if (!plan) throw ApiError.notFound('NOT_FOUND');
  for (const k of ['name', 'description', 'price', 'currency', 'features', 'rules', 'icon', 'gradient', 'sort_order', 'is_active']) {
    if (patch[k] !== undefined) plan[k] = patch[k];
  }
  await plan.save();
  return plan;
}

/** Deletes a plan (admin). @returns {Promise<{ removed: boolean }>} */
export async function deletePlan(id) {
  const deleted = await db.SubscriptionPlan.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

/* -------------------------------------------------------------------------- */
/* Fan subscriptions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns the caller's current active subscription with its plan rules, or the
 * implicit Free tier when none is active.
 * @param {string} userId
 * @returns {Promise<{ subscription: object|null, planId: string, plan: object|null }>}
 */
export async function getMySubscription(userId) {
  const subscription = await db.FanSubscription.findOne({
    where: { user_id: userId, is_active: true },
    order: [['started_at', 'DESC']],
    raw: true,
  });
  const planId = subscription?.subscription_type ?? 'free';
  const plan = await db.SubscriptionPlan.findByPk(planId, { raw: true }).catch(() => null);
  return { subscription: subscription ?? null, planId, plan: plan ?? null };
}

/**
 * Starts a Stripe recurring checkout for a paid tier. The resulting subscription
 * row is created/activated by the Stripe webhook on `checkout.session.completed`.
 * @param {string} userId
 * @param {'pro'|'premium'} plan
 * @returns {Promise<{ url: string }>}
 */
export async function subscribe(userId, plan) {
  return initStripeSubscription({ userId, plan });
}

/**
 * Directly activates a fan subscription tier without Stripe (free/manual path).
 * Upserts the caller's active row: an existing active row is retargeted to the
 * new tier, otherwise a new active row is created.
 * @param {string} userId
 * @param {string} plan - Subscription tier (`free`|`pro`|`premium`).
 * @returns {Promise<object>} The active subscription row.
 */
export async function activate(userId, plan) {
  const existing = await db.FanSubscription.findOne({
    where: { user_id: userId, is_active: true },
    order: [['started_at', 'DESC']],
  });
  if (existing) {
    existing.subscription_type = plan;
    existing.is_active = true;
    existing.started_at = new Date();
    existing.expires_at = null;
    await existing.save();
    return existing;
  }
  return db.FanSubscription.create({
    user_id: userId,
    subscription_type: plan,
    is_active: true,
    started_at: new Date(),
  });
}

/**
 * Cancels the caller's active subscription at period end (Stripe), and reflects
 * the state locally so the UI shows "cancels on …" immediately.
 * @param {string} userId
 * @returns {Promise<{ canceled: boolean }>}
 * @throws {ApiError} 404 when no active subscription exists.
 */
export async function cancel(userId) {
  const sub = await db.FanSubscription.findOne({ where: { user_id: userId, is_active: true } });
  if (!sub) throw ApiError.notFound('NO_ACTIVE_SUBSCRIPTION');

  if (sub.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    } catch (err) {
      throw ApiError.badRequest('SUBSCRIPTION_CANCEL_FAILED', { details: { message: err.message } });
    }
  } else {
    // No Stripe binding (e.g. comped) → deactivate immediately.
    sub.is_active = false;
    sub.expires_at = new Date();
    await sub.save();
  }
  return { canceled: true };
}

export default {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getMySubscription,
  subscribe,
  activate,
  cancel,
};
