/**
 * @file Realtime event bus.
 *
 * Holds the Socket.IO server instance once realtime is attached, and exposes
 * tiny emit helpers so **services can broadcast without importing Socket.IO or
 * creating circular dependencies**. When realtime is not attached (e.g. unit
 * tests, migration CLI) every emit is a safe no-op.
 *
 * @module realtime/bus
 */

/** @type {import('socket.io').Server | null} */
let io = null;

/**
 * Registers the Socket.IO server instance (called by `attachRealtime`).
 * @param {import('socket.io').Server} instance
 */
export function setIo(instance) {
  io = instance;
}

/**
 * Builds a canonical room name for an event type + id.
 * @param {'duel'|'concert'|'competition'|'live'} type
 * @param {string} id
 * @returns {string}
 */
export function roomName(type, id) {
  return `${type}:${id}`;
}

/**
 * Emits an event to everyone in a room on a namespace (no-op if not attached).
 * @param {string} namespace - e.g. '/chat', '/live'.
 * @param {string} room
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToRoom(namespace, room, event, payload) {
  io?.of(namespace).to(room).emit(event, payload);
}

/**
 * Emits a notification to a specific user's personal channel.
 * @param {string} userId
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToUser(userId, event, payload) {
  io?.of('/notifications').to(`user:${userId}`).emit(event, payload);
}

/**
 * Current member count of a room (authoritative Socket.IO adapter count — same
 * value clients see via `presence`), 0 if realtime isn't attached or nobody's in it.
 * @param {string} namespace - e.g. '/live'.
 * @param {string} room
 * @returns {number}
 */
export function getRoomSize(namespace, room) {
  return io?.of(namespace).adapter.rooms.get(room)?.size ?? 0;
}

/**
 * Distinct authenticated user ids currently connected to a room (for a host's
 * "pick a moderator from current viewers" picker). Cross-references the
 * adapter's socket-id set with each socket's `userId` (attached by the
 * namespace auth middleware) — sockets with no `userId` (anonymous) are
 * excluded. `[]` if realtime isn't attached or nobody (authenticated) is in it.
 * @param {string} namespace - e.g. '/live'.
 * @param {string} room
 * @returns {string[]}
 */
export function getRoomUserIds(namespace, room) {
  const nsp = io?.of(namespace);
  const socketIds = nsp?.adapter.rooms.get(room);
  if (!socketIds) return [];
  const ids = new Set();
  for (const socketId of socketIds) {
    const userId = nsp.sockets.get(socketId)?.userId;
    if (userId) ids.add(userId);
  }
  return [...ids];
}

export default { setIo, roomName, emitToRoom, emitToUser, getRoomSize, getRoomUserIds };
