import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));
vi.mock('../src/services/messaging.service.js', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), sendSms: vi.fn() }));

import { db } from '../src/models/index.js';
import * as withdrawals from '../src/services/withdrawal.service.js';
import { callProcedure } from '../src/utils/procedures.js';

/**
 * @file Withdrawal service tests: PIN lifecycle (bcrypt + lockout + reset),
 * net computation, reserve/revert lifecycle (procedure result mapping), and
 * payout-method management with default handling.
 */

const U_PIN = '55555555-5555-5555-5555-555555555551';
const U_LOCK = '55555555-5555-5555-5555-555555555552';
const U_REQ = '55555555-5555-5555-5555-555555555553';
const U_METHODS = '55555555-5555-5555-5555-555555555554';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: U_PIN, email: 'p@x.co', full_name: 'Pin' },
    { id: U_LOCK, email: 'l@x.co', full_name: 'Lock' },
    { id: U_REQ, email: 'q@x.co', full_name: 'Req' },
  ]);
  await db.PlatformSetting.create({
    key: 'economic_config',
    value: { withdrawal: { artist_fee_pct: 5, manager_fee_pct: 10, mobile_money_min_credits: 500, auto_process: false } },
  });
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(() => vi.clearAllMocks());

describe('PIN lifecycle', () => {
  it('reports no PIN, then sets and reports it', async () => {
    expect(await withdrawals.hasPin(U_PIN)).toEqual({ hasPin: false });
    await withdrawals.setPin(U_PIN, '123456');
    expect(await withdrawals.hasPin(U_PIN)).toEqual({ hasPin: true });
  });

  it('requires the current PIN to change it', async () => {
    await expect(withdrawals.setPin(U_PIN, '999999')).rejects.toMatchObject({ code: 'PIN_CURRENT_REQUIRED' });
    await expect(withdrawals.setPin(U_PIN, '999999', '000000')).rejects.toMatchObject({ code: 'PIN_WRONG_CURRENT' });
    await expect(withdrawals.setPin(U_PIN, '654321', '123456')).resolves.toEqual({ success: true });
  });

  it('verifies a correct PIN', async () => {
    await expect(withdrawals.verifyPin(U_PIN, '654321')).resolves.toEqual({ success: true });
  });

  it('locks after 5 failed attempts', async () => {
    await withdrawals.setPin(U_LOCK, '111111');
    for (let i = 0; i < 5; i++) {
      await expect(withdrawals.verifyPin(U_LOCK, '000000')).rejects.toMatchObject({ code: 'PIN_WRONG' });
    }
    await expect(withdrawals.verifyPin(U_LOCK, '111111')).rejects.toMatchObject({ code: 'PIN_LOCKED', statusCode: 423 });
  });

  it('rejects verify when no PIN is set', async () => {
    await expect(withdrawals.verifyPin('ghost', '123456')).rejects.toMatchObject({ code: 'PIN_NOT_SET' });
  });

  it('resets the PIN via emailed OTP', async () => {
    await withdrawals.requestPinReset(U_PIN);
    const token = await db.WithdrawalPinResetToken.findOne({ where: { user_id: U_PIN }, order: [['created_at', 'DESC']] });
    expect(token).toBeTruthy();
    await expect(withdrawals.confirmPinReset(U_PIN, '000000', '222222')).rejects.toMatchObject({ code: 'PIN_RESET_INVALID' });
  });
});

describe('calculateNet', () => {
  it('applies the artist fee', async () => {
    const res = await withdrawals.calculateNet(U_REQ, 1000);
    expect(res).toMatchObject({ gross: 1000, feePct: 5, fee: 50, net: 950 });
  });

  it('applies the manager fee for managers', async () => {
    await db.UserRole.create({ user_id: U_REQ, role: 'manager' });
    const res = await withdrawals.calculateNet(U_REQ, 1000);
    expect(res.feePct).toBe(10);
    expect(res.net).toBe(900);
    await db.UserRole.destroy({ where: { user_id: U_REQ, role: 'manager' } });
  });
});

describe('requestWithdrawal', () => {
  beforeAll(async () => {
    await withdrawals.setPin(U_REQ, '424242');
    await db.UserPayoutMethod.create({ user_id: U_REQ, method: 'mobile_money', label: 'MoMo', phone_number: '+225', is_default: true });
  });

  it('reserves funds and returns pending', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', id: 'wd-1' });
    const res = await withdrawals.requestWithdrawal(U_REQ, { amount: 1000, pin: '424242' });
    expect(res).toEqual({ withdrawalId: 'wd-1', status: 'pending' });
    expect(callProcedure).toHaveBeenCalledWith(
      'reserve_withdrawal',
      expect.arrayContaining([U_REQ, 1000, 'mobile_money']),
      ['success', 'code', 'id'],
    );
  });

  it('rejects below the per-method minimum', async () => {
    await expect(withdrawals.requestWithdrawal(U_REQ, { amount: 100, pin: '424242' })).rejects.toMatchObject({
      code: 'WITHDRAWAL_BELOW_MINIMUM',
    });
  });

  it('rejects with a wrong PIN before touching funds', async () => {
    await expect(withdrawals.requestWithdrawal(U_REQ, { amount: 1000, pin: '000000' })).rejects.toMatchObject({
      code: 'PIN_WRONG',
    });
    expect(callProcedure).not.toHaveBeenCalled();
  });

  it('maps insufficient balance from the procedure', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'insufficient_balance' });
    await expect(withdrawals.requestWithdrawal(U_REQ, { amount: 1000, pin: '424242' })).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT',
    });
  });

  it('404s when no payout method exists', async () => {
    await withdrawals.setPin('nomethod', '424242');
    await db.Profile.create({ id: 'nomethod', email: 'n@x.co', full_name: 'No' });
    await expect(withdrawals.requestWithdrawal('nomethod', { amount: 1000, pin: '424242' })).rejects.toMatchObject({
      code: 'NO_PAYOUT_METHOD',
    });
  });
});

describe('admin lifecycle', () => {
  it('approves a pending request', async () => {
    const req = await db.WithdrawalRequest.create({ user_id: U_REQ, amount: 500, payment_method: 'mobile_money', status: 'pending' });
    const res = await withdrawals.approve(req.id, 'admin-1');
    expect(res.status).toBe('approved');
  });

  it('rejects+refunds via the revert procedure', async () => {
    const req = await db.WithdrawalRequest.create({ user_id: U_REQ, amount: 500, payment_method: 'mobile_money', status: 'pending' });
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok' });
    const res = await withdrawals.reject(req.id, 'admin-1');
    expect(res).toEqual({ reverted: true });
    expect(callProcedure).toHaveBeenCalledWith('revert_withdrawal', [req.id, 'admin-1'], ['success', 'code']);
  });

  it('completes an approved request', async () => {
    const req = await db.WithdrawalRequest.create({ user_id: U_REQ, amount: 500, payment_method: 'mobile_money', status: 'approved' });
    const res = await withdrawals.complete(req.id, 'admin-1', 'TX-9');
    expect(res.status).toBe('completed');
    expect(res.provider_tx_id).toBe('TX-9');
  });
});

describe('payout methods', () => {
  it('first method becomes default', async () => {
    const m = await withdrawals.addMethod(U_METHODS, { method: 'mobile_money', phone_number: '+225' });
    expect(m.is_default).toBe(true);
  });

  it('new default demotes the previous one', async () => {
    const m2 = await withdrawals.addMethod(U_METHODS, { method: 'paypal', paypal_email: 'x@y.co', is_default: true });
    expect(m2.is_default).toBe(true);
    const defaults = await db.UserPayoutMethod.count({ where: { user_id: U_METHODS, is_default: true } });
    expect(defaults).toBe(1);
  });

  it('lists methods default-first', async () => {
    const list = await withdrawals.listMethods(U_METHODS);
    expect(list[0].is_default).toBeTruthy(); // raw read → 1 on SQLite
  });

  it('updates and deletes a method', async () => {
    const list = await withdrawals.listMethods(U_METHODS);
    const nonDefault = list.find((m) => !m.is_default);
    const upd = await withdrawals.updateMethod(U_METHODS, nonDefault.id, { label: 'Renamed' });
    expect(upd.label).toBe('Renamed');
    const del = await withdrawals.deleteMethod(U_METHODS, nonDefault.id);
    expect(del).toEqual({ removed: true });
  });
});
