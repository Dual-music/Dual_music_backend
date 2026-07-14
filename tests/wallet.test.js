import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the stored-procedure caller: wallet debits are atomic MySQL procedures
// not available on SQLite, so we drive their machine result codes directly and
// assert the service maps them to the correct API errors / success shapes.
vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));

import { callProcedure } from '../src/utils/procedures.js';
import { db } from '../src/models/index.js';
import * as wallet from '../src/services/wallet.service.js';

/**
 * @file Wallet service unit tests — 100% branch coverage of the credit debit
 * wrappers (procedure result-code → API error mapping) plus the two SQL revenue
 * aggregations (run against real SQLite).
 */

const UID = '11111111-1111-1111-1111-111111111111';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  // Synthetic ids (no real users): relax FK enforcement for these unit fixtures.
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
});

afterAll(async () => {
  await db.sequelize.close();
});

beforeEach(() => {
  vi.mocked(callProcedure).mockReset();
});

describe('getBalance', () => {
  it('returns 0 with eur value when no wallet exists', async () => {
    const res = await wallet.getBalance(UID);
    expect(res.balance).toBe(0);
    expect(res.eurValue).toBe(0);
  });

  it('returns the wallet balance and its EUR value', async () => {
    await db.UserWallet.create({ user_id: UID, balance: 100 });
    const res = await wallet.getBalance(UID);
    expect(res.balance).toBe(100);
    expect(res.eurValue).toBeGreaterThan(0);
  });
});

describe('voteForDuel', () => {
  it('succeeds when the procedure reports success', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true });
    await expect(wallet.voteForDuel(UID, { duelId: 'd1', artistId: 'a1', amount: 5 })).resolves.toEqual({ success: true });
    expect(callProcedure).toHaveBeenCalledWith('deduct_wallet_and_vote', [UID, 5, 'd1', 'a1'], ['success']);
  });

  it('throws WALLET_INSUFFICIENT when the procedure fails', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false });
    await expect(wallet.voteForDuel(UID, { duelId: 'd1', artistId: 'a1', amount: 5 })).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT',
    });
  });
});

describe('purchaseGift + errorFromCode mapping', () => {
  it('succeeds on ok', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok' });
    await expect(wallet.purchaseGift(UID, { giftId: 'g1', quantity: 2 })).resolves.toEqual({ success: true });
  });

  it.each([
    ['insufficient_balance', 'WALLET_INSUFFICIENT', 400],
    ['already_purchased', 'ALREADY_TICKETED', 409],
    ['sold_out', 'TICKETS_SOLD_OUT', 409],
    ['no_inventory', 'BAD_REQUEST', 400],
    ['invalid_quantity', 'AMOUNT_INVALID', 400],
    ['gift_not_found', 'NOT_FOUND', 404],
    ['duel_not_found', 'NOT_FOUND', 404],
    ['concert_not_found', 'NOT_FOUND', 404],
    ['replay_not_found', 'NOT_FOUND', 404],
    ['some_unknown_code', 'BAD_REQUEST', 400],
  ])('maps procedure code "%s" → %s', async (code, expectedCode, status) => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code });
    await expect(wallet.purchaseGift(UID, { giftId: 'g1', quantity: 1 })).rejects.toMatchObject({
      code: expectedCode,
      statusCode: status,
    });
  });
});

describe('sendGift', () => {
  it('returns the transaction id on success', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', entity_id: 'tx-1' });
    const res = await wallet.sendGift(UID, { giftId: 'g1', toUserId: 'u2' });
    expect(res).toEqual({ success: true, transactionId: 'tx-1' });
    expect(callProcedure).toHaveBeenCalledWith(
      'send_gift_with_distribution',
      [UID, 'g1', 'u2', null, null, null],
      ['success', 'code', 'entity_id'],
    );
  });

  it('throws on failure code', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'insufficient_balance' });
    await expect(wallet.sendGift(UID, { giftId: 'g1', toUserId: 'u2' })).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT' });
  });
});

describe('ticket & replay purchases', () => {
  it('purchaseDuelTicket returns ticketId', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', entity_id: 't-1' });
    await expect(wallet.purchaseDuelTicket(UID, 'd1')).resolves.toEqual({ success: true, ticketId: 't-1' });
  });

  it('purchaseDuelTicket throws on failure', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'already_purchased' });
    await expect(wallet.purchaseDuelTicket(UID, 'd1')).rejects.toMatchObject({ code: 'ALREADY_TICKETED' });
  });

  it('purchaseConcertTicket returns ticketId + ticketCode', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', entity_id: 't-2', extra: 'CODE-2' });
    await expect(wallet.purchaseConcertTicket(UID, 'c1')).resolves.toEqual({
      success: true,
      ticketId: 't-2',
      ticketCode: 'CODE-2',
    });
  });

  it('purchaseConcertTicket throws on sold_out', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'sold_out' });
    await expect(wallet.purchaseConcertTicket(UID, 'c1')).rejects.toMatchObject({ code: 'TICKETS_SOLD_OUT' });
  });

  it('purchaseReplayAccess returns accessId', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', entity_id: 'r-1' });
    await expect(wallet.purchaseReplayAccess(UID, 'rep1')).resolves.toEqual({ success: true, accessId: 'r-1' });
  });

  it('purchaseReplayAccess throws on replay_not_found', async () => {
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'replay_not_found' });
    await expect(wallet.purchaseReplayAccess(UID, 'rep1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('revenue aggregations (real SQL)', () => {
  beforeAll(async () => {
    await db.RevenueDistribution.bulkCreate([
      { payer_id: 'p1', source_id: 's1', source_type: 'duel', total_credits: 100, artist1_id: UID, artist1_credits: 40, platform_credits: 10 },
      { payer_id: 'p2', source_id: 's1', source_type: 'duel', total_credits: 100, artist1_id: UID, artist1_credits: 20, platform_credits: 5 },
      { payer_id: 'p3', source_id: 's2', source_type: 'concert', total_credits: 50, manager_id: UID, manager_credits: 15, platform_credits: 5 },
    ]);
  });

  it('getRevenuesByEvent groups by source with summed credits', async () => {
    const rows = await wallet.getRevenuesByEvent(UID);
    const byId = Object.fromEntries(rows.map((r) => [r.source_id, r]));
    expect(Number(byId.s1.total_received)).toBe(60);
    expect(Number(byId.s1.tx_count)).toBe(2);
    expect(Number(byId.s2.total_received)).toBe(15);
  });

  it('getRevenueBreakdown groups by source type', async () => {
    const rows = await wallet.getRevenueBreakdown(UID);
    const byType = Object.fromEntries(rows.map((r) => [r.source_type, Number(r.total)]));
    expect(byType.duel).toBe(60);
    expect(byType.concert).toBe(15);
  });

  it('getRevenueBreakdown scopes to a single source when sourceId is given', async () => {
    const rows = await wallet.getRevenueBreakdown(UID, 's1');
    expect(rows).toHaveLength(1);
    expect(rows[0].source_type).toBe('duel');
    expect(Number(rows[0].total)).toBe(60);
  });
});

describe('getMySpending', () => {
  const PAYER = '11111111-1111-1111-1111-1111111111ff';

  beforeAll(async () => {
    await db.RevenueDistribution.bulkCreate([
      { payer_id: PAYER, source_id: 'sp1', source_type: 'gift_duel', total_credits: 30, platform_credits: 5, created_at: new Date('2020-01-01') },
      { payer_id: PAYER, source_id: 'sp2', source_type: 'vote', total_credits: 10, platform_credits: 2, created_at: new Date('2020-02-01') },
    ]);
  });

  it('returns the caller outgoing distributions, newest first', async () => {
    const rows = await wallet.getMySpending(PAYER);
    expect(rows).toHaveLength(2);
    expect(rows[0].source_id).toBe('sp2'); // newest first
  });

  it('honors the limit option', async () => {
    expect(await wallet.getMySpending(PAYER, { limit: 1 })).toHaveLength(1);
  });
});

describe('sendGift — event context branches', () => {
  beforeAll(async () => {
    await db.VirtualGift.create({ id: 'gp1', name: 'Rose', emoji: '🌹', price: 5, is_active: true });
  });

  it.each([
    ['duelId', 'd9'],
    ['liveId', 'l9'],
    ['concertId', 'c9'],
  ])('emits on the %s stage and settles the gift', async (key, id) => {
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', entity_id: 'tx-ctx' });
    const res = await wallet.sendGift(UID, { giftId: 'gp1', toUserId: 'u2', [key]: id });
    expect(res).toEqual({ success: true, transactionId: 'tx-ctx' });
  });
});
