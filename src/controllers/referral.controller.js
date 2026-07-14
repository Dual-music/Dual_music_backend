import * as referralService from '../services/referral.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Referrals HTTP controllers (thin).
 * @module controllers/referral.controller
 */

/** GET /referrals/config — public reward config (for the signup form). */
export async function config(_req, res) {
  const { enabled, rewardCredits } = await referralService.getConfig();
  return sendSuccess(res, { enabled, rewardCredits });
}

/** GET /referrals/me — the caller's referral dashboard. */
export async function myReferrals(req, res) {
  return sendSuccess(res, await referralService.getMyReferrals(req.user.id));
}

/** POST /referrals/:id/claim — claim a completed referral's reward. */
export async function claim(req, res) {
  return sendSuccess(res, await referralService.claimReward(req.user.id, req.params.id));
}

export default { config, myReferrals, claim };
