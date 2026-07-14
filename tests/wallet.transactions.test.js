import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/models/index.js';
import { countEventTransactions, getEventTransactions, getRevenuesByEvent } from '../src/services/wallet.service.js';

/**
 * @file Wallet event-transactions ledger tests (mirrors get_my/count_my_event_transactions):
 * per-distribution breakdown of the caller's share for a source event.
 */

const ME = '99999999-9999-9999-9999-999999999991';
const SRC = 'src-event-1';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.RevenueDistribution.bulkCreate([
    { payer_id: 'p1', source_id: SRC, source_type: 'duel', total_credits: 100, artist1_id: ME, artist1_credits: 40, artist2_id: 'a2', artist2_credits: 30, manager_id: 'm1', manager_credits: 10, platform_credits: 20 },
    { payer_id: 'p2', source_id: SRC, source_type: 'duel', total_credits: 50, artist1_id: 'x', artist1_credits: 20, manager_id: ME, manager_credits: 15, platform_credits: 15 },
    { payer_id: 'p3', source_id: 'other-src', source_type: 'duel', total_credits: 10, artist1_id: ME, artist1_credits: 5, platform_credits: 5 },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('event transactions ledger', () => {
  it('returns only the source rows where the caller participated, with their share', async () => {
    const rows = await getEventTransactions(ME, SRC, { limit: 25, offset: 0 });
    expect(rows).toHaveLength(2);
    const asArtist = rows.find((r) => Number(r.total_credits) === 100);
    expect(Number(asArtist.my_credits)).toBe(40); // artist1 share
    expect(Number(asArtist.artists_credits)).toBe(70); // 40 + 30
    const asManager = rows.find((r) => Number(r.total_credits) === 50);
    expect(Number(asManager.my_credits)).toBe(15); // manager share
  });

  it('counts the caller transactions for the source', async () => {
    expect(await countEventTransactions(ME, SRC)).toBe(2);
  });

  it('respects offset paging', async () => {
    const page2 = await getEventTransactions(ME, SRC, { limit: 1, offset: 1 });
    expect(page2).toHaveLength(1);
  });
});

describe('revenues by event — period filter', () => {
  const RUSER = '99999999-9999-9999-9999-99999999aaaa';
  const OLD = new Date('2020-01-01T00:00:00Z');
  const RECENT = new Date('2020-06-01T00:00:00Z');

  beforeAll(async () => {
    await db.RevenueDistribution.bulkCreate([
      { payer_id: 'op', source_id: 'rev-old', source_type: 'duel', total_credits: 100, artist1_id: RUSER, artist1_credits: 40, platform_credits: 60, created_at: OLD },
      { payer_id: 'np', source_id: 'rev-new', source_type: 'live', total_credits: 100, artist1_id: RUSER, artist1_credits: 55, platform_credits: 45, created_at: RECENT },
    ]);
  });

  it('returns every event when no since bound is given', async () => {
    const rows = await getRevenuesByEvent(RUSER);
    const ids = rows.map((r) => r.source_id).sort();
    expect(ids).toEqual(['rev-new', 'rev-old']);
  });

  it('scopes to events at/after the since bound', async () => {
    const rows = await getRevenuesByEvent(RUSER, new Date('2020-03-01T00:00:00Z').toISOString());
    expect(rows).toHaveLength(1);
    expect(rows[0].source_id).toBe('rev-new');
    expect(Number(rows[0].total_received)).toBe(55);
  });
});
