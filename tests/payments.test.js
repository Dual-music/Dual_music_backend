import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external providers + the stored-procedure caller. The DB (SQLite) is
// real, so transaction persistence + pricing (which reads platform_settings /
// exchange_rates) are exercised end-to-end.
vi.mock('../src/services/payments/providers/cinetpay.client.js', () => ({
  initPayment: vi.fn(),
  checkPayment: vi.fn(),
}));
vi.mock('../src/services/payments/providers/moneroo.client.js', () => ({
  initPayment: vi.fn(),
  verifySignature: vi.fn(),
  verifyPayment: vi.fn(),
}));
vi.mock('../src/services/payments/providers/stripe.client.js', () => ({
  createCreditsCheckout: vi.fn(),
  createSubscriptionCheckout: vi.fn(),
}));
vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));

import { db } from '../src/models/index.js';
import * as payments from '../src/services/payments/payments.service.js';
import { computeCreditsForRecharge } from '../src/services/payments/pricing.service.js';
import * as cinetpay from '../src/services/payments/providers/cinetpay.client.js';
import * as moneroo from '../src/services/payments/providers/moneroo.client.js';
import * as stripe from '../src/services/payments/providers/stripe.client.js';
import { callProcedure } from '../src/utils/procedures.js';

/**
 * @file Payments + pricing service unit tests — full branch coverage of the
 * recharge init flows, the signature-verified webhook settlements, the Stripe
 * event handler, and the recharge quote math.
 */

const UID = '22222222-2222-2222-2222-222222222222';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.PlatformSetting.create({
    key: 'economic_config',
    value: { credit_value_usd: 0.01, recharge: { fee_pct: 0, provider_fees: { moneroo: 10 } } },
  });
  await db.ExchangeRate.bulkCreate([
    { currency_code: 'USD', rate_per_usd: 1, name: 'US Dollar', symbol: '$' },
    { currency_code: 'XOF', rate_per_usd: 600, name: 'CFA', symbol: 'F' },
  ]);
  await db.CinetpayCountry.create({
    country_code: 'CI',
    currency: 'XOF',
    is_active: true,
    country_name: "Côte d'Ivoire",
    phone_prefix: '+225',
    secret_key_name: 'CINETPAY_CI_KEY',
    secret_password_name: 'CINETPAY_CI_PWD',
  });
});

afterAll(async () => {
  await db.sequelize.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeCreditsForRecharge (pricing)', () => {
  it('converts amount → credits via fee + exchange rate (floored)', async () => {
    const q = await computeCreditsForRecharge(6000, 'XOF', 'cinetpay');
    // 6000 XOF, 0% fee, rate 600/USD → 10 USD → /0.01 = 1000 credits
    expect(q.credits).toBe(1000);
    expect(q.feePct).toBe(0);
    expect(q.creditValueUsd).toBe(0.01);
  });

  it('applies a per-provider fee override', async () => {
    const q = await computeCreditsForRecharge(6000, 'XOF', 'moneroo');
    expect(q.feePct).toBe(10); // provider override
    expect(q.credits).toBe(900); // 10 USD * 0.9 / 0.01
  });

  it('falls back to rate 1 for an unknown currency', async () => {
    const q = await computeCreditsForRecharge(1, 'ZZZ', 'stripe');
    expect(q.credits).toBe(100); // 1 / 0.01
  });
});

describe('initCinetpay', () => {
  it('persists a pending tx and returns the hosted checkout URL', async () => {
    cinetpay.initPayment.mockResolvedValue({ paymentUrl: 'https://pay/cp', raw: { ok: true } });
    const res = await payments.initCinetpay({ userId: UID, amount: 6000, countryCode: 'CI', phone: '+225070000' });
    expect(res.paymentUrl).toBe('https://pay/cp');
    expect(res.credits).toBe(1000);
    const tx = await db.CinetpayTransaction.findOne({ where: { merchant_transaction_id: res.merchantTransactionId } });
    expect(tx.status).toBe('pending');
    expect(Number(tx.credits_amount)).toBe(1000);
    expect(tx.raw_init_response).toBeTruthy();
  });

  it('rejects an unsupported country', async () => {
    await expect(payments.initCinetpay({ userId: UID, amount: 6000, countryCode: 'ZZ' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects when the amount buys zero credits', async () => {
    await expect(payments.initCinetpay({ userId: UID, amount: 1, countryCode: 'CI' })).rejects.toMatchObject({
      code: 'AMOUNT_INVALID',
    });
  });
});

describe('initMoneroo', () => {
  it('persists a tx and returns the checkout URL', async () => {
    moneroo.initPayment.mockResolvedValue({ id: 'mo_1', checkoutUrl: 'https://pay/mo', raw: {} });
    const res = await payments.initMoneroo({ userId: UID, amount: 6000, currency: 'XOF', email: 'a@b.co' });
    expect(res.checkoutUrl).toBe('https://pay/mo');
    const tx = await db.MonerooTransaction.findOne({ where: { merchant_transaction_id: res.merchantTransactionId } });
    expect(tx.moneroo_transaction_id).toBe('mo_1');
  });

  it('rejects when credits <= 0', async () => {
    await expect(payments.initMoneroo({ userId: UID, amount: 0, currency: 'XOF' })).rejects.toMatchObject({
      code: 'AMOUNT_INVALID',
    });
  });
});

describe('initStripeCredits + initStripeSubscription', () => {
  it('creates a credits checkout session', async () => {
    stripe.createCreditsCheckout.mockResolvedValue({ url: 'https://stripe/credits' });
    const res = await payments.initStripeCredits({ userId: UID, amount: 6000, currency: 'XOF' });
    expect(res.url).toBe('https://stripe/credits');
  });

  it('rejects a credits checkout that buys zero credits', async () => {
    await expect(payments.initStripeCredits({ userId: UID, amount: 0, currency: 'XOF' })).rejects.toMatchObject({
      code: 'AMOUNT_INVALID',
    });
  });

  it('creates a subscription checkout for the configured premium plan', async () => {
    stripe.createSubscriptionCheckout.mockResolvedValue({ url: 'https://stripe/sub' });
    const res = await payments.initStripeSubscription({ userId: UID, plan: 'premium' });
    expect(res.url).toBe('https://stripe/sub');
  });

  it('rejects a plan whose Stripe price is not configured (pro)', async () => {
    await expect(payments.initStripeSubscription({ userId: UID, plan: 'pro' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('handleCinetpayWebhook', () => {
  async function seedTx(id) {
    return db.CinetpayTransaction.create({
      merchant_transaction_id: id,
      notify_token: `tok_${id}`,
      user_id: UID,
      amount: 6000,
      currency: 'XOF',
      country_code: 'CI',
      payment_method: 'MOBILE_MONEY',
      phone_number: '+225070000',
      kind: 'payin',
      status: 'pending',
      credits_amount: 1000,
    });
  }

  it('rejects a body without a merchant id', async () => {
    await expect(payments.handleCinetpayWebhook({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s when the transaction is unknown', async () => {
    await expect(payments.handleCinetpayWebhook({ cpm_trans_id: 'nope' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns ok:false when the provider status is not accepted', async () => {
    await seedTx('cp_reject');
    cinetpay.checkPayment.mockResolvedValue({ accepted: false, status: 'REFUSED', raw: {} });
    await expect(payments.handleCinetpayWebhook({ cpm_trans_id: 'cp_reject' })).resolves.toEqual({ ok: false });
  });

  it('credits the wallet when accepted and the procedure succeeds', async () => {
    await seedTx('cp_ok');
    cinetpay.checkPayment.mockResolvedValue({ accepted: true, status: 'ACCEPTED', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ ok: true, already: false, balance: 1000 });
    await expect(payments.handleCinetpayWebhook({ transaction_id: 'cp_ok' })).resolves.toEqual({ ok: true });
    expect(callProcedure).toHaveBeenCalledWith('cinetpay_credit_wallet', ['cp_ok', 1000], ['ok', 'already', 'error', 'balance']);
  });

  it('throws when the credit procedure reports failure', async () => {
    await seedTx('cp_fail');
    cinetpay.checkPayment.mockResolvedValue({ accepted: true, status: 'ACCEPTED', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ ok: false, error: 'tx_not_found' });
    await expect(payments.handleCinetpayWebhook({ cpm_trans_id: 'cp_fail' })).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  });
});

describe('handleMonerooWebhook', () => {
  async function seedTx(monerooId) {
    return db.MonerooTransaction.create({
      merchant_transaction_id: `m_${monerooId}`,
      moneroo_transaction_id: monerooId,
      user_id: UID,
      amount: 6000,
      currency: 'XOF',
      kind: 'payin',
      status: 'pending',
      credits_amount: 900,
    });
  }

  it('rejects an invalid signature', async () => {
    moneroo.verifySignature.mockReturnValue(false);
    await expect(payments.handleMonerooWebhook(Buffer.from('x'), 'sig', {})).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
  });

  it('404s when the payment is unknown', async () => {
    moneroo.verifySignature.mockReturnValue(true);
    await expect(payments.handleMonerooWebhook(Buffer.from('x'), 'sig', { data: { id: 'ghost' } })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns ok:false when verification fails', async () => {
    await seedTx('mo_unverified');
    moneroo.verifySignature.mockReturnValue(true);
    moneroo.verifyPayment.mockResolvedValue({ success: false });
    await expect(
      payments.handleMonerooWebhook(Buffer.from('x'), 'sig', { data: { id: 'mo_unverified' } }),
    ).resolves.toEqual({ ok: false });
  });

  it('credits the wallet on verified success', async () => {
    await seedTx('mo_ok');
    moneroo.verifySignature.mockReturnValue(true);
    moneroo.verifyPayment.mockResolvedValue({ success: true });
    vi.mocked(callProcedure).mockResolvedValue({ ok: true });
    await expect(
      payments.handleMonerooWebhook(Buffer.from('x'), 'sig', { data: { id: 'mo_ok' } }),
    ).resolves.toEqual({ ok: true });
  });

  it('throws when the credit procedure fails', async () => {
    await seedTx('mo_fail');
    moneroo.verifySignature.mockReturnValue(true);
    moneroo.verifyPayment.mockResolvedValue({ success: true });
    vi.mocked(callProcedure).mockResolvedValue({ ok: false, error: 'x' });
    await expect(
      payments.handleMonerooWebhook(Buffer.from('x'), 'sig', { data: { id: 'mo_fail' } }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
  });
});

describe('handleStripeEvent', () => {
  it('credits the wallet for a completed credits checkout', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ ok: true });
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'sess_1', amount_total: 1000, currency: 'eur', metadata: { type: 'credits', user_id: UID, credits: '100' } } },
    };
    await expect(payments.handleStripeEvent(event)).resolves.toEqual({ ok: true });
    expect(callProcedure).toHaveBeenCalledWith('credit_wallet_stripe', [UID, 'sess_1', 100, 10, 'EUR'], ['ok', 'already']);
  });

  it('activates a subscription for a completed subscription checkout', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'sess_2', subscription: 'sub_1', customer: 'cus_1', metadata: { type: 'subscription', user_id: UID, plan: 'premium' } } },
    };
    await expect(payments.handleStripeEvent(event)).resolves.toEqual({ ok: true });
    const sub = await db.FanSubscription.findOne({ where: { stripe_subscription_id: 'sub_1' } });
    expect(sub.is_active).toBe(true);
    expect(sub.subscription_type).toBe('premium');
  });

  it('updates a subscription on customer.subscription.updated', async () => {
    await db.FanSubscription.create({ user_id: UID, subscription_type: 'premium', stripe_subscription_id: 'sub_2', is_active: true, started_at: new Date() });
    const event = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_2', status: 'canceled', current_period_end: 1893456000 } },
    };
    await expect(payments.handleStripeEvent(event)).resolves.toEqual({ ok: true });
    const sub = await db.FanSubscription.findOne({ where: { stripe_subscription_id: 'sub_2' } });
    expect(sub.is_active).toBe(false);
  });

  it('ignores unrelated event types', async () => {
    await expect(payments.handleStripeEvent({ type: 'invoice.paid', data: { object: {} } })).resolves.toEqual({ ok: true });
  });
});

describe('read/ledger helpers', () => {
  const RUID = '33333333-3333-3333-3333-333333333333';
  const OTHER = '44444444-4444-4444-4444-444444444444';

  beforeAll(async () => {
    await db.CinetpayCountry.create({
      country_code: 'SN', currency: 'XOF', is_active: false, country_name: 'Sénégal',
      phone_prefix: '+221', secret_key_name: 'K', secret_password_name: 'P',
    });
    await db.CreditPurchase.bulkCreate([
      { user_id: RUID, credits_amount: 100, currency: 'XOF', paid_amount: 1000, payment_method: 'cinetpay', status: 'completed', created_at: new Date('2020-01-01') },
      { user_id: RUID, credits_amount: 50, currency: 'XOF', paid_amount: 500, payment_method: 'moneroo', status: 'completed', created_at: new Date('2020-02-01') },
    ]);
    await db.CinetpayTransaction.create({
      merchant_transaction_id: 'cp_read_1', notify_token: 'n1', user_id: RUID, amount: 1000, currency: 'XOF',
      country_code: 'CI', payment_method: 'ALL', phone_number: '', kind: 'payin', status: 'ACCEPTED', credits_amount: 100,
    });
    await db.MonerooTransaction.create({
      merchant_transaction_id: 'mo_read_1', user_id: RUID, amount: 500, currency: 'XOF', debug_logs: '',
      kind: 'payin', status: 'success', credits_amount: 50,
    });
  });

  it('listCinetpayCountries returns only active countries with safe fields', async () => {
    const rows = await payments.listCinetpayCountries();
    expect(rows.every((r) => r.country_code !== 'SN')).toBe(true); // SN is inactive
    expect(rows.find((r) => r.country_code === 'CI')).toBeTruthy();
    expect(rows[0]).not.toHaveProperty('secret_key_name');
  });

  it('listMyCreditPurchases returns the caller history newest-first, honoring the limit', async () => {
    const all = await payments.listMyCreditPurchases(RUID);
    expect(all).toHaveLength(2);
    expect(new Date(all[0].created_at) >= new Date(all[1].created_at)).toBe(true);
    expect(await payments.listMyCreditPurchases(RUID, { limit: 1 })).toHaveLength(1);
  });

  it('getTransactionByMerchant resolves a CinetPay receipt for the owner', async () => {
    await expect(payments.getTransactionByMerchant(RUID, 'cp_read_1')).resolves.toMatchObject({
      provider: 'cinetpay', amount: 1000, currency: 'XOF', credits: 100, status: 'ACCEPTED',
    });
  });

  it('getTransactionByMerchant falls through to Moneroo', async () => {
    await expect(payments.getTransactionByMerchant(RUID, 'mo_read_1')).resolves.toMatchObject({
      provider: 'moneroo', amount: 500, credits: 50,
    });
  });

  it('getTransactionByMerchant 404s for an unknown id or another user', async () => {
    await expect(payments.getTransactionByMerchant(RUID, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(payments.getTransactionByMerchant(OTHER, 'cp_read_1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('listCinetpayTransactions returns the payin ledger', async () => {
    const rows = await payments.listCinetpayTransactions({ limit: 10 });
    expect(rows.find((r) => r.merchant_transaction_id === 'cp_read_1')).toBeTruthy();
  });

  it('verifyCinetpayTransaction passes through the provider check', async () => {
    cinetpay.checkPayment.mockResolvedValue({ accepted: true, status: 'ACCEPTED' });
    await expect(payments.verifyCinetpayTransaction('cp_read_1')).resolves.toEqual({
      merchantTransactionId: 'cp_read_1', accepted: true, status: 'ACCEPTED',
    });
  });
});

describe('webhook + dispatch branch edges', () => {
  it('cinetpay webhook is idempotent on replay', async () => {
    await db.CinetpayTransaction.create({
      merchant_transaction_id: 'cp_rep', notify_token: 'nr', user_id: UID, amount: 100, currency: 'XOF',
      country_code: 'CI', payment_method: 'ALL', phone_number: '', kind: 'payin', status: 'pending', credits_amount: 10,
    });
    cinetpay.checkPayment.mockResolvedValue({ accepted: true, status: 'ACCEPTED', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ ok: true, already: false, balance: 100 });
    await payments.handleCinetpayWebhook({ transaction_id: 'cp_rep' }); // transaction_id fallback branch
    await expect(payments.handleCinetpayWebhook({ cpm_trans_id: 'cp_rep' })).resolves.toMatchObject({ ok: true, replayed: true });
  });

  it('moneroo webhook is idempotent on replay', async () => {
    await db.MonerooTransaction.create({
      merchant_transaction_id: 'm_rep', moneroo_transaction_id: 'mo_rep', user_id: UID, amount: 100, currency: 'XOF',
      debug_logs: '', kind: 'payin', status: 'pending', credits_amount: 10,
    });
    moneroo.verifySignature.mockReturnValue(true);
    moneroo.verifyPayment.mockResolvedValue({ success: true });
    vi.mocked(callProcedure).mockResolvedValue({ ok: true });
    await payments.handleMonerooWebhook(Buffer.from('x'), 'sig', { data: { id: 'mo_rep' } });
    await expect(payments.handleMonerooWebhook(Buffer.from('x'), 'sig', { data: { id: 'mo_rep' } })).resolves.toMatchObject({ ok: true, replayed: true });
  });

  it('stripe event is idempotent on replay', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ ok: true });
    const event = { id: 'evt_rep', type: 'invoice.paid', data: { object: {} } };
    await payments.handleStripeEvent(event);
    await expect(payments.handleStripeEvent(event)).resolves.toMatchObject({ ok: true, replayed: true });
  });

  it('stripe credits checkout falls back on missing currency/amount', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ ok: true, already: false });
    const event = { id: 'evt_fb', type: 'checkout.session.completed', data: { object: { id: 'sess_fb', metadata: { type: 'credits', user_id: UID, credits: '5' } } } };
    await expect(payments.handleStripeEvent(event)).resolves.toEqual({ ok: true });
    expect(callProcedure).toHaveBeenCalledWith('credit_wallet_stripe', [UID, 'sess_fb', 5, 0, 'EUR'], ['ok', 'already']);
  });

  it('stripe checkout with no metadata is a no-op success', async () => {
    const event = { id: 'evt_nometa', type: 'checkout.session.completed', data: { object: { id: 'sess_nm' } } };
    await expect(payments.handleStripeEvent(event)).resolves.toEqual({ ok: true });
  });

  it('stripe subscription.deleted deactivates without a period end', async () => {
    await db.FanSubscription.create({ user_id: UID, subscription_type: 'premium', stripe_subscription_id: 'sub_del', is_active: true, started_at: new Date() });
    const event = { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_del', status: 'canceled' } } };
    await expect(payments.handleStripeEvent(event)).resolves.toEqual({ ok: true });
    const sub = await db.FanSubscription.findOne({ where: { stripe_subscription_id: 'sub_del' } });
    expect(sub.is_active).toBe(false);
  });

  it('list helpers fall back to default page size on a zero limit', async () => {
    await expect(payments.listMyCreditPurchases(UID, { limit: 0 })).resolves.toBeInstanceOf(Array);
    await expect(payments.listCinetpayTransactions({ limit: 0 })).resolves.toBeInstanceOf(Array);
  });

  it('initCinetpay defaults the phone to empty when omitted', async () => {
    cinetpay.initPayment.mockResolvedValue({ paymentUrl: 'https://pay/cp2', raw: {} });
    const res = await payments.initCinetpay({ userId: UID, amount: 6000, countryCode: 'CI' });
    const tx = await db.CinetpayTransaction.findOne({ where: { merchant_transaction_id: res.merchantTransactionId } });
    expect(tx.phone_number).toBe('');
  });
});

describe('computeCreditsForRecharge — config fallbacks', () => {
  let savedValue;

  beforeAll(async () => {
    const row = await db.PlatformSetting.findByPk('economic_config', { raw: true });
    savedValue = row?.value ?? null;
    await db.PlatformSetting.destroy({ where: { key: 'economic_config' } });
  });

  afterAll(async () => {
    if (savedValue) await db.PlatformSetting.create({ key: 'economic_config', value: savedValue });
  });

  it('applies safe defaults when economic_config is absent', async () => {
    // No config → credit_value_usd defaults to 0.01, fee 0, USD rate 1.
    const q = await computeCreditsForRecharge(100, 'USD', 'cinetpay');
    expect(q.creditValueUsd).toBe(0.01);
    expect(q.feePct).toBe(0);
    expect(q.credits).toBe(10000);
  });
});
