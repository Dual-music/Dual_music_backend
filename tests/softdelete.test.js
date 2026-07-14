import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/models/index.js';
import * as replays from '../src/services/replay.service.js';

/**
 * @file Soft-delete (paranoid) tests for user-content tables (§5): `destroy()`
 * stamps `deleted_at` and reads exclude removed rows, while `paranoid:false`
 * still surfaces them for audit.
 */

const USER = '88888888-8888-8888-8888-888888888888';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('paranoid models', () => {
  it('replay_videos soft-deletes via the service', async () => {
    const r = await replays.createReplay(USER, { sourceType: 'duel', eventId: 'd1', title: 'X', videoUrl: 'u' });
    expect(await replays.deleteReplay(r.id, USER, [])).toEqual({ removed: true });

    // Default reads exclude it; getReplay 404s.
    expect(await db.ReplayVideo.findByPk(r.id)).toBeNull();
    await expect(replays.getReplay(r.id)).rejects.toMatchObject({ statusCode: 404 });

    // But the row survives with deleted_at set (audit).
    const withDeleted = await db.ReplayVideo.findByPk(r.id, { paranoid: false });
    expect(withDeleted).not.toBeNull();
    expect(withDeleted.deleted_at).toBeTruthy();
  });

  it('comments soft-delete', async () => {
    const c = await db.Comment.create({ content: 'hi', content_id: 'x', content_type: 'blog', user_id: USER });
    await c.destroy();
    expect(await db.Comment.count()).toBe(0);
    expect(await db.Comment.count({ paranoid: false })).toBe(1);
  });

  it('restores a soft-deleted row', async () => {
    const c = await db.Comment.create({ content: 'bye', content_id: 'y', content_type: 'blog', user_id: USER });
    await c.destroy();
    await c.restore();
    const found = await db.Comment.findByPk(c.id);
    expect(found).not.toBeNull();
    expect(found.deleted_at).toBeNull();
  });
});
