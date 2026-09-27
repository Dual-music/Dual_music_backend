import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/models/index.js';
import * as chat from '../src/services/chat.service.js';
import * as moderation from '../src/services/moderation.service.js';

/**
 * @file Generic event-chat service tests: the `chat_enabled` gate (host can
 * silence a chat for everyone), the ban gate (a banned user can't post even
 * via a direct API call, not just hidden client-side), and message-hiding
 * authorization (author, event host/appointed moderator, or platform staff).
 */

const HOST = 'c0000000-0000-0000-0000-000000000001';
const VIEWER = 'c0000000-0000-0000-0000-000000000002';
const OUTSIDER = 'c0000000-0000-0000-0000-000000000003';

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.Profile.bulkCreate([
    { id: HOST, email: 'host@x.co', full_name: 'Host' },
    { id: VIEWER, email: 'viewer@x.co', full_name: 'Viewer' },
    { id: OUTSIDER, email: 'outsider@x.co', full_name: 'Outsider' },
  ]);
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('postMessage — chat_enabled gate', () => {
  it('posts normally while chat is enabled (the model default)', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    const msg = await chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'hello' });
    expect(msg).toMatchObject({ live_id: live.id, user_id: VIEWER, message: 'hello' });
  });

  it('rejects posting once the host disables chat', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date(), chat_enabled: false });
    await expect(
      chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'hello' }),
    ).rejects.toMatchObject({ code: 'CHAT_DISABLED' });
  });

  it('rejects posting for a banned user, even though the ban is otherwise only client-filtered', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    await db.StreamBan.create({ stream_id: live.id, stream_type: 'live', banned_user_id: VIEWER, banned_by: HOST });
    await expect(
      chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'hello' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects posting for a user banned from a competition (dedicated competition_bans table)', async () => {
    const comp = await db.Competition.create({
      manager_id: HOST, title: 'C', mode: 'online', status: 'published',
      start_at: new Date(), end_at: new Date(Date.now() + 3600_000),
      application_deadline: new Date(Date.now() + 1800_000), max_candidates: 0,
      eligibility_scope: 'all', eligible_countries: '',
    });
    await db.CompetitionBan.create({ competition_id: comp.id, banned_user_id: VIEWER, banned_by: HOST });
    await expect(
      chat.postMessage(chat.CHAT_BINDINGS.competition, { eventId: comp.id, userId: VIEWER, message: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('moderateMessage — author, event host/moderator, or platform staff', () => {
  it('lets the author hide their own message', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    const msg = await chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'oops' });
    await chat.moderateMessage(chat.CHAT_BINDINGS.live, msg.id, { id: VIEWER }, []);
    expect((await db.LiveChatMessage.findByPk(msg.id)).is_moderated).toBe(true);
  });

  it('lets the event host (not a global role) hide someone else\'s message', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    const msg = await chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'spam' });
    await chat.moderateMessage(chat.CHAT_BINDINGS.live, msg.id, { id: HOST }, []);
    expect((await db.LiveChatMessage.findByPk(msg.id)).is_moderated).toBe(true);
  });

  it('lets an appointed moderator hide someone else\'s message', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    await moderation.appointModerator('live', live.id, { id: HOST }, [], OUTSIDER);
    const msg = await chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'spam' });
    await chat.moderateMessage(chat.CHAT_BINDINGS.live, msg.id, { id: OUTSIDER }, []);
    expect((await db.LiveChatMessage.findByPk(msg.id)).is_moderated).toBe(true);
  });

  it('forbids an unrelated viewer', async () => {
    const live = await db.ArtistLive.create({ artist_id: HOST, status: 'live', started_at: new Date() });
    const msg = await chat.postMessage(chat.CHAT_BINDINGS.live, { eventId: live.id, userId: VIEWER, message: 'spam' });
    await expect(chat.moderateMessage(chat.CHAT_BINDINGS.live, msg.id, { id: OUTSIDER }, [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('404s an unknown message', async () => {
    await expect(
      chat.moderateMessage(chat.CHAT_BINDINGS.live, '00000000-0000-0000-0000-000000000000', { id: HOST }, []),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
