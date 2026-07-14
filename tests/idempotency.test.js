import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { idempotency } from '../src/middlewares/idempotency.js';
import { db } from '../src/models/index.js';
import { claimWebhookEvent, markWebhookProcessed } from '../src/services/webhook.service.js';

/**
 * @file Idempotency + webhook-dedup tests. The middleware replays a stored
 * response for a repeated `Idempotency-Key` (no double execution) and rejects
 * key reuse with a different payload; the webhook ledger short-circuits an
 * already-processed provider event.
 */

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal app exposing an idempotent "financial" endpoint with a side effect.
let counter = 0;
const app = express();
app.use(express.json());
app.post(
  '/pay',
  (req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  },
  idempotency(),
  (_req, res) => {
    counter += 1;
    res.status(201).json({ data: { n: counter }, meta: {} });
  },
);
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ error: { code: err.code || 'ERR' } }));

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('idempotency middleware', () => {
  it('requires the Idempotency-Key header', async () => {
    const res = await request(app).post('/pay').send({ amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('runs once and replays the same response for a repeated key', async () => {
    const first = await request(app).post('/pay').set('Idempotency-Key', 'k1').send({ amount: 10 });
    expect(first.status).toBe(201);
    const n = first.body.data.n;
    await delay(50); // let the finish handler persist the response

    const replay = await request(app).post('/pay').set('Idempotency-Key', 'k1').send({ amount: 10 });
    expect(replay.status).toBe(201);
    expect(replay.body.data.n).toBe(n); // same result — handler did not run again
  });

  it('rejects reusing a key with a different payload', async () => {
    await request(app).post('/pay').set('Idempotency-Key', 'k2').send({ amount: 10 });
    await delay(50);
    const conflict = await request(app).post('/pay').set('Idempotency-Key', 'k2').send({ amount: 999 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('treats a different key as a new operation', async () => {
    const a = await request(app).post('/pay').set('Idempotency-Key', 'k3').send({ amount: 10 });
    await delay(50);
    const b = await request(app).post('/pay').set('Idempotency-Key', 'k4').send({ amount: 10 });
    expect(b.body.data.n).toBe(a.body.data.n + 1);
  });
});

describe('webhook dedup ledger', () => {
  it('claims fresh, then short-circuits a processed duplicate', async () => {
    const first = await claimWebhookEvent('cinetpay', 'evt-1');
    expect(first.fresh).toBe(true);
    await markWebhookProcessed(first.record);

    const dup = await claimWebhookEvent('cinetpay', 'evt-1');
    expect(dup.fresh).toBe(false);
  });

  it('allows re-processing while still in "processing" (e.g. pending → accepted)', async () => {
    const first = await claimWebhookEvent('moneroo', 'evt-2');
    expect(first.fresh).toBe(true);
    const again = await claimWebhookEvent('moneroo', 'evt-2');
    expect(again.fresh).toBe(true); // not yet marked processed
  });

  it('cannot dedupe without an external id (fails open)', async () => {
    const res = await claimWebhookEvent('stripe', undefined);
    expect(res).toEqual({ fresh: true, record: null });
  });
});
