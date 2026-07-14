import http from 'node:http';

import { io as ioClient } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { emitToRoom, emitToUser, roomName } from '../src/realtime/bus.js';
import { attachRealtime } from '../src/realtime/index.js';
import { signAccessToken } from '../src/utils/jwt.js';

/**
 * @file Realtime end-to-end tests — a real Socket.IO server (attached to an HTTP
 * server on an ephemeral port) driven by a real socket.io-client. Verifies the
 * JWT handshake (required on `/notifications`, optional on `/chat` /`/live`),
 * room join/leave, per-room broadcast, and per-user notification delivery via
 * the decoupled bus helpers.
 */

/** @type {http.Server} */
let server;
let port;

beforeAll(async () => {
  server = http.createServer();
  attachRealtime(server);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = (ns, opts = {}) =>
  ioClient(`http://localhost:${port}${ns}`, { transports: ['websocket'], forceNew: true, reconnection: false, ...opts });

/** Resolves with the first payload of `event`, or rejects on timeout. */
function waitEvent(sock, event, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    sock.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('/notifications namespace (auth required)', () => {
  it('rejects an anonymous connection', async () => {
    const sock = connect('/notifications');
    const err = await waitEvent(sock, 'connect_error');
    expect(err.message).toMatch(/unauthorized/i);
    sock.close();
  });

  it('accepts a valid JWT and delivers to the user channel', async () => {
    const userId = 'realtime-user-1';
    const token = signAccessToken({ sub: userId, jti: 'rt-jti-1' });
    const sock = connect('/notifications', { auth: { token } });
    await waitEvent(sock, 'connect');
    await delay(80); // let the server-side `join(user:<id>)` complete

    const received = waitEvent(sock, 'notification:new');
    emitToUser(userId, 'notification:new', { title: 'Ping', message: 'hi' });
    const msg = await received;
    expect(msg.title).toBe('Ping');
    sock.close();
  });

  it('accepts a Bearer-prefixed token from the query string', async () => {
    const userId = 'realtime-user-2';
    const token = signAccessToken({ sub: userId, jti: 'rt-jti-2' });
    const sock = connect('/notifications', { query: { token: `Bearer ${token}` } });
    await waitEvent(sock, 'connect');
    sock.close();
  });
});

describe('/live namespace (anonymous read + rooms)', () => {
  it('broadcasts to clients that joined the room only', async () => {
    const inRoom = connect('/live');
    const outRoom = connect('/live');
    await Promise.all([waitEvent(inRoom, 'connect'), waitEvent(outRoom, 'connect')]);

    inRoom.emit('join', { type: 'duel', id: 'd-1' });
    outRoom.emit('join', { type: 'duel', id: 'd-2' });
    await delay(80);

    const got = waitEvent(inRoom, 'vote:new');
    let leaked = false;
    outRoom.once('vote:new', () => {
      leaked = true;
    });

    emitToRoom('/live', roomName('duel', 'd-1'), 'vote:new', { total: 7 });
    const msg = await got;
    expect(msg.total).toBe(7);
    await delay(60);
    expect(leaked).toBe(false);

    inRoom.close();
    outRoom.close();
  });

  it('stops delivering after leaving a room', async () => {
    const sock = connect('/live');
    await waitEvent(sock, 'connect');
    sock.emit('join', { type: 'competition', id: 'c-1' });
    await delay(60);
    sock.emit('leave', { type: 'competition', id: 'c-1' });
    await delay(60);

    let received = false;
    sock.once('focus:changed', () => {
      received = true;
    });
    emitToRoom('/live', roomName('competition', 'c-1'), 'focus:changed', { forced_focus_participant_id: 'x' });
    await delay(120);
    expect(received).toBe(false);
    sock.close();
  });
});

describe('/chat namespace (anonymous)', () => {
  it('delivers chat messages to a joined room', async () => {
    const sock = connect('/chat');
    await waitEvent(sock, 'connect');
    sock.emit('join', { type: 'concert', id: 'con-1' });
    await delay(80);

    const got = waitEvent(sock, 'chat:new');
    emitToRoom('/chat', roomName('concert', 'con-1'), 'chat:new', { id: 'm1', body: 'hello' });
    const msg = await got;
    expect(msg.body).toBe('hello');
    sock.close();
  });
});
