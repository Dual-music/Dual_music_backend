import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));

import { db } from '../src/models/index.js';
import * as referrals from '../src/services/referral.service.js';
import { callProcedure } from '../src/utils/procedures.js';

/**
 * @file Referral service tests: admin-configurable reward, dashboard aggregation
 * and the idempotent claim (procedure result-code → API error mapping).
 */

const REFERRER = '44444444-4444-4444-4444-444444444444';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: REFERRER, email: 'r@x.co', full_name: 'Ref Errer', referral_code: 'REF-ABC12345' },
    { id: 'ref-1', email: 'f1@x.co', full_name: 'Filleul Un' },
    { id: 'ref-2', email: 'f2@x.co', full_name: 'Filleul Deux' },
  ]);
  await db.Referral.bulkCreate([
    { referrer_id: REFERRER, referred_id: 'ref-1', referral_code: 'REF-ABC12345', status: 'completed', reward_claimed: false },
    { referrer_id: REFERRER, referred_id: 'ref-2', referral_code: 'REF-ABC12345', status: 'completed', reward_claimed: true },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(() => vi.mocked(callProcedure).mockReset());

describe('getConfig', () => {
  it('defaults reward to 50 and enabled when unset', async () => {
    const cfg = await referrals.getConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.rewardCredits).toBe(50);
  });

  it('reads the admin-configured reward', async () => {
    await db.PlatformSetting.upsert({ key: 'referral_config', value: { enabled: true, referrer_bonus: 75 } });
    const cfg = await referrals.getConfig();
    expect(cfg.rewardCredits).toBe(75);
  });
});

describe('getMyReferrals', () => {
  it('returns code, hydrated referrals and stats', async () => {
    const res = await referrals.getMyReferrals(REFERRER);
    expect(res.referralCode).toBe('REF-ABC12345');
    expect(res.referrals).toHaveLength(2);
    expect(res.referrals[0].referred).toBeTruthy();
    expect(res.stats.completed).toBe(2);
    expect(res.stats.unclaimed).toBe(1);
    expect(res.stats.pendingRewardCredits).toBe(res.stats.unclaimed * res.stats.rewardCredits);
  });
});

describe('claimReward', () => {
  it('claims when the procedure succeeds', async () => {
    await db.PlatformSetting.upsert({ key: 'referral_config', value: { enabled: true, referrer_bonus: 60 } });
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok' });
    const res = await referrals.claimReward(REFERRER, 'some-id');
    expect(res).toEqual({ claimed: true, rewardCredits: 60 });
    expect(callProcedure).toHaveBeenCalledWith('claim_referral_reward', ['some-id', REFERRER, 60], ['success', 'code']);
  });

  it('rejects when referrals are disabled', async () => {
    await db.PlatformSetting.upsert({ key: 'referral_config', value: { enabled: false } });
    await expect(referrals.claimReward(REFERRER, 'x')).rejects.toMatchObject({ code: 'REFERRAL_DISABLED' });
  });

  it.each([
    ['not_found', 'NOT_FOUND', 404],
    ['not_completed', 'REFERRAL_NOT_COMPLETED', 409],
    ['already_claimed', 'REFERRAL_ALREADY_CLAIMED', 409],
    ['weird', 'REFERRAL_CLAIM_FAILED', 400],
  ])('maps procedure code "%s" → %s', async (code, expected, status) => {
    await db.PlatformSetting.upsert({ key: 'referral_config', value: { enabled: true } });
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code });
    await expect(referrals.claimReward(REFERRER, 'x')).rejects.toMatchObject({ code: expected, statusCode: status });
  });
});
