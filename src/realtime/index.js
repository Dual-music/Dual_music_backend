import { Server } from 'socket.io';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { verifyToken } from '../utils/jwt.js';

import { roomName, setIo } from './bus.js';

/**
 * @file Socket.IO realtime layer.
 *
 * Three namespaces:
 *  - `/chat`          — event chat streams (join `duel:<id>`, `concert:<id>`, …).
 *  - `/live`          — live stage signals: votes, gifts, camera focus, performer,
 *                       sponsor-ad broadcasts.
 *  - `/notifications` — per-user push channel (`user:<id>`), auth required.
 *
 * JWT is validated on the handshake (`socket.handshake.auth.token` or
 * `?token=`). `/chat` and `/live` allow anonymous read (public viewing);
 * `/notifications` requires a valid token.
 *
 * @module realtime/index
 */

/**
 * Extracts a bearer token from the handshake.
 * @param {import('socket.io').Socket} socket
 * @returns {string|null}
 */
function handshakeToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  const fromQuery = socket.handshake.query?.token;
  const raw = fromAuth || fromQuery;
  if (!raw) return null;
  return String(raw).replace(/^Bearer\s+/i, '');
}

/**
 * Namespace middleware that attaches `socket.userId` when a valid token is
 * present. Rejects the connection when `required` and no valid token exists.
 * @param {boolean} required
 * @returns {(socket: import('socket.io').Socket, next: (err?: Error) => void) => void}
 */
function authMiddleware(required) {
  return (socket, next) => {
    const token = handshakeToken(socket);
    if (!token) {
      if (required) return next(new Error('unauthorized'));
      socket.userId = null;
      return next();
    }
    try {
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      return next();
    } catch {
      if (required) return next(new Error('unauthorized'));
      socket.userId = null;
      return next();
    }
  };
}

/** Room-join validation: known event types + real-time leaderboard rooms. */
const VALID_TYPES = new Set(['duel', 'concert', 'competition', 'live', 'leaderboard']);

/**
 * Wires join/leave handlers for a room-based namespace.
 * @param {import('socket.io').Namespace} nsp
 */
/**
 * Emits the current member count of a room to everyone in it (viewer count /
 * presence). Uses the namespace's adapter room set size.
 * @param {import('socket.io').Namespace} nsp
 * @param {string} room
 */
function emitPresence(nsp, room) {
  const count = nsp.adapter.rooms.get(room)?.size ?? 0;
  nsp.to(room).emit('presence', { room, count });
}

function wireRoomNamespace(nsp) {
  nsp.on('connection', (socket) => {
    // Rooms this socket joined, so we can recount presence on disconnect.
    const joined = new Set();

    socket.on('join', ({ type, id } = {}) => {
      if (VALID_TYPES.has(type) && typeof id === 'string') {
        const room = roomName(type, id);
        socket.join(room);
        joined.add(room);
        emitPresence(nsp, room);
      }
    });
    socket.on('leave', ({ type, id } = {}) => {
      if (VALID_TYPES.has(type) && typeof id === 'string') {
        const room = roomName(type, id);
        socket.leave(room);
        joined.delete(room);
        emitPresence(nsp, room);
      }
    });
    socket.on('disconnecting', () => {
      // Recount each joined room once this socket has left (deferred a tick).
      for (const room of joined) setImmediate(() => emitPresence(nsp, room));
    });

    // --- Ephemeral peer broadcast relay (replaces Supabase `broadcast` channels:
    // floating hearts/emojis, gift animations, timer sync, mute controls, guest
    // media state). Clients join a named broadcast channel and relay arbitrary
    // `{event, payload}` to the other members (sender excluded; senders apply
    // their own effect locally).
    socket.on('broadcast:join', (channel) => {
      if (typeof channel === 'string' && channel.length <= 200) socket.join(`bc:${channel}`);
    });
    socket.on('broadcast:leave', (channel) => {
      if (typeof channel === 'string') socket.leave(`bc:${channel}`);
    });
    socket.on('broadcast', ({ channel, event, payload } = {}) => {
      if (typeof channel === 'string' && typeof event === 'string' && channel.length <= 200) {
        socket.to(`bc:${channel}`).emit('broadcast', { channel, event, payload });
      }
    });
  });
}

/**
 * Attaches the Socket.IO server to an HTTP server and returns it.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  const chat = io.of('/chat');
  chat.use(authMiddleware(false));
  wireRoomNamespace(chat);

  const live = io.of('/live');
  live.use(authMiddleware(false));
  wireRoomNamespace(live);

  const notifications = io.of('/notifications');
  notifications.use(authMiddleware(true));
  notifications.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
  });

  setIo(io);
  logger.info('Realtime (Socket.IO) attached: /chat /live /notifications');
  return io;
}

export default attachRealtime;
