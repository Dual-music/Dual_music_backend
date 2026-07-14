import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/models/index.js';
import * as notifications from '../src/services/notification.service.js';

/**
 * @file Notification service tests (in-memory SQLite): inbox reads, read-state,
 * email preferences (defaults + whitelist) and Web Push subscription upsert.
 */

const UID = '33333333-3333-3333-3333-333333333333';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Notification.bulkCreate([
    { user_id: UID, type: 'gift', title: 'A', message: 'a', read: false },
    { user_id: UID, type: 'vote', title: 'B', message: 'b', read: false },
    { user_id: UID, type: 'system', title: 'C', message: 'c', read: true },
    { user_id: 'other', type: 'gift', title: 'X', message: 'x', read: false },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('list + unread count', () => {
  it('lists only the user own notifications', async () => {
    const { rows } = await notifications.listNotifications(UID, {});
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.user_id === UID)).toBe(true);
  });

  it('filters unread with read=false', async () => {
    const { rows } = await notifications.listNotifications(UID, { read: 'false' });
    expect(rows).toHaveLength(2);
  });

  it('filters read with read=true', async () => {
    const { rows } = await notifications.listNotifications(UID, { read: 'true' });
    expect(rows).toHaveLength(1);
  });

  it('counts unread', async () => {
    expect(await notifications.unreadCount(UID)).toEqual({ unread: 2 });
  });
});

describe('read-state mutations', () => {
  it('marks one as read', async () => {
    const { rows } = await notifications.listNotifications(UID, { read: 'false' });
    const target = rows[0];
    const updated = await notifications.markRead(UID, target.id);
    expect(updated.read).toBe(true);
    expect((await notifications.unreadCount(UID)).unread).toBe(1);
  });

  it('404s marking a foreign notification', async () => {
    const foreign = await db.Notification.findOne({ where: { user_id: 'other' } });
    await expect(notifications.markRead(UID, foreign.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('marks all as read', async () => {
    const res = await notifications.markAllRead(UID);
    expect(res.updated).toBeGreaterThanOrEqual(1);
    expect((await notifications.unreadCount(UID)).unread).toBe(0);
  });

  it('deletes a notification', async () => {
    const { rows } = await notifications.listNotifications(UID, {});
    const res = await notifications.remove(UID, rows[0].id);
    expect(res).toEqual({ removed: true });
  });
});

describe('email preferences', () => {
  it('creates opt-in defaults on first access', async () => {
    const pref = await notifications.getEmailPreferences(UID);
    expect(pref.user_id).toBe(UID);
    expect(pref.email_gifts).toBe(false); // opt-in: email notifications default off
  });

  it('updates only whitelisted keys', async () => {
    const pref = await notifications.updateEmailPreferences(UID, { email_gifts: true, hacker: true });
    expect(pref.email_gifts).toBe(true);
    expect(pref.hacker).toBeUndefined();
  });
});

describe('web push subscription', () => {
  const sub = { endpoint: 'https://push/abc', p256dh: 'p', auth: 'a' };

  it('creates a subscription', async () => {
    const row = await notifications.subscribePush(UID, sub);
    expect(row.endpoint).toBe(sub.endpoint);
    expect(await db.PushSubscription.count()).toBe(1);
  });

  it('is idempotent on the same endpoint', async () => {
    await notifications.subscribePush(UID, { ...sub, p256dh: 'p2' });
    expect(await db.PushSubscription.count()).toBe(1);
  });

  it('unsubscribes by endpoint', async () => {
    const res = await notifications.unsubscribePush(UID, sub.endpoint);
    expect(res).toEqual({ removed: true });
    expect(await db.PushSubscription.count()).toBe(0);
  });
});
