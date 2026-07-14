import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { MESSAGES, resolveMessage } from '../src/i18n/messages.js';
import { db } from '../src/models/index.js';

/**
 * @file i18n tests (§3.8): every machine error code raised in the codebase has a
 * FR + EN message, `resolveMessage` honors the language, and the HTTP layer
 * localizes errors per `Accept-Language`.
 */

const app = createApp();

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});
afterAll(async () => {
  await db.sequelize.close();
});

/** Recursively collects every machine code passed to ApiError across `src`. */
function collectCodes(dir) {
  const codes = new Set();
  const re = /ApiError\.[a-zA-Z]+\(\s*'([A-Z0-9_]+)'|new ApiError\(\s*\d+\s*,\s*'([A-Z0-9_]+)'/g;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const full = join(entry.path ?? dir, entry.name);
    const src = readFileSync(full, 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) codes.add(m[1] || m[2]);
  }
  return [...codes];
}

describe('message catalog completeness', () => {
  const usedCodes = collectCodes('src');

  it('collected a meaningful number of codes', () => {
    expect(usedCodes.length).toBeGreaterThan(20);
  });

  it.each(usedCodes)('code %s has non-empty FR and EN messages', (code) => {
    const entry = MESSAGES[code];
    expect(entry, `Missing i18n entry for "${code}"`).toBeTruthy();
    expect(entry.fr.length).toBeGreaterThan(0);
    expect(entry.en.length).toBeGreaterThan(0);
    expect(entry.fr).not.toBe(entry.en); // genuinely translated, not a copy
  });
});

describe('resolveMessage', () => {
  it('returns the language-specific message', () => {
    expect(resolveMessage('WALLET_INSUFFICIENT', 'fr')).toBe(MESSAGES.WALLET_INSUFFICIENT.fr);
    expect(resolveMessage('WALLET_INSUFFICIENT', 'en')).toBe(MESSAGES.WALLET_INSUFFICIENT.en);
  });

  it('defaults to French', () => {
    expect(resolveMessage('NOT_FOUND')).toBe(MESSAGES.NOT_FOUND.fr);
  });

  it('falls back for an unknown code', () => {
    expect(resolveMessage('__NOPE__', 'en', 'custom fallback')).toBe('custom fallback');
    expect(resolveMessage('__NOPE__', 'en')).toBe(MESSAGES.INTERNAL_ERROR.en);
  });

  it('falls back to FR when the language is missing on an entry', () => {
    // 'en' always present in the catalog; assert the FR path when lang unknown.
    expect(resolveMessage('NOT_FOUND', 'de')).toBe(MESSAGES.NOT_FOUND.fr);
  });
});

describe('HTTP error localization (Accept-Language)', () => {
  it('returns a French message by default', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toBe(MESSAGES.UNAUTHENTICATED.fr);
  });

  it('returns an English message when Accept-Language: en', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Accept-Language', 'en-US,en;q=0.9');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(MESSAGES.UNAUTHENTICATED.en);
  });

  it('localizes the 404 handler', async () => {
    const fr = await request(app).get('/api/v1/does-not-exist');
    expect(fr.body.error.message).toBe(MESSAGES.NOT_FOUND.fr);
    const en = await request(app).get('/api/v1/does-not-exist').set('Accept-Language', 'en');
    expect(en.body.error.message).toBe(MESSAGES.NOT_FOUND.en);
  });
});
