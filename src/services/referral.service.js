import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { callProcedure } from '../utils/procedures.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Referrals domain service.
 *
 * A user's `profiles.referral_code` is shared at signup; each new signup that
 * used it creates a `referrals` row (referrer→referred, status `completed`).
 * The referrer can then claim a one-time credit reward per referral, credited
 * atomically via `claim_referral_reward`. The reward amount is admin-configured
 * through `platform_settings.referral_config`.
 *
 * @module services/referral.service
 */

const DEFAULT_REWARD = 50;

/**
 * Reads the admin referral configuration (reward amount + enabled flag).
 * @returns {Promise<{ enabled: boolean, rewardCredits: number, raw: object }>}
 */
export async function getConfig() {
  // No `raw`: let Sequelize's JSON getter parse the value (SQLite stores JSON as
  // TEXT and would otherwise return a string).
  const row = await db.PlatformSetting.findByPk('referral_config');
  const cfg = row?.value ?? {};
  const rewardCredits =
    Number(cfg.referrer_bonus ?? cfg.referrer_bonus_credits ?? cfg.reward_credits ?? DEFAULT_REWARD) || DEFAULT_REWARD;
  return { enabled: cfg.enabled !== false, rewardCredits, raw: cfg };
}

/**
 * Returns the caller's referral dashboard: their code, the people they referred
 * (with display names), and aggregate stats.
 * @param {string} userId
 * @returns {Promise<{ referralCode: string|null, referrals: object[], stats: object }>}
 */
export async function getMyReferrals(userId) {
  const profile = await db.Profile.findByPk(userId, { attributes: ['referral_code'], raw: true });
  const referrals = await db.Referral.findAll({
    where: { referrer_id: userId },
    order: [['created_at', 'DESC']],
    raw: true,
  });

  const names = await getDisplayProfiles(referrals.map((r) => r.referred_id));
  const byId = new Map(names.map((p) => [p.id, p]));
  const hydrated = referrals.map((r) => ({ ...r, referred: byId.get(r.referred_id) ?? null }));

  const { rewardCredits } = await getConfig();
  const completed = hydrated.filter((r) => r.status === 'completed');
  const unclaimed = completed.filter((r) => !r.reward_claimed);
  const stats = {
    total: hydrated.length,
    completed: completed.length,
    unclaimed: unclaimed.length,
    pendingRewardCredits: unclaimed.length * rewardCredits,
    rewardCredits,
  };
  return { referralCode: profile?.referral_code ?? null, referrals: hydrated, stats };
}

/**
 * Claims the reward for one completed referral (referrer-scoped, idempotent).
 * @param {string} userId
 * @param {string} referralId
 * @returns {Promise<{ claimed: boolean, rewardCredits: number }>}
 * @throws {ApiError} 404 not found · 409 not completed / already claimed.
 */
export async function claimReward(userId, referralId) {
  const { enabled, rewardCredits } = await getConfig();
  if (!enabled) throw ApiError.badRequest('REFERRAL_DISABLED');

  const out = await callProcedure(
    'claim_referral_reward',
    [referralId, userId, rewardCredits],
    ['success', 'code'],
  );
  if (!out.success) {
    if (out.code === 'not_found') throw ApiError.notFound('NOT_FOUND');
    if (out.code === 'not_completed') throw ApiError.conflict('REFERRAL_NOT_COMPLETED');
    if (out.code === 'already_claimed') throw ApiError.conflict('REFERRAL_ALREADY_CLAIMED');
    throw ApiError.badRequest('REFERRAL_CLAIM_FAILED', { details: { code: out.code } });
  }
  return { claimed: true, rewardCredits };
}

export default { getConfig, getMyReferrals, claimReward };
