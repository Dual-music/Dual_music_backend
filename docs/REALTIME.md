# Realtime (Socket.IO — `src/realtime`)

The Socket.IO server shares the HTTP server (`attachRealtime` in `server.js`) and
exposes three namespaces. Services broadcast through the decoupled bus
(`src/realtime/bus.js`) so no service imports Socket.IO directly.

## Handshake / auth

JWT is read from `socket.handshake.auth.token` or `?token=` (a leading
`Bearer ` is stripped).

| Namespace | Auth | Purpose |
| --- | --- | --- |
| `/chat` | optional | Event chat streams (anonymous read allowed). |
| `/live` | optional | Live-stage signals: votes, gifts, camera focus, performer timer, sponsor ads. |
| `/notifications` | **required** | Per-user push channel; auto-joins `user:<id>`. |

## Rooms

Clients `emit('join', { type, id })` / `emit('leave', …)` where
`type ∈ { duel, concert, competition, live, leaderboard }`. Room name =
`` `${type}:${id}` `` (see `roomName`). For live rankings, `id` is the season id.

## Server → client events

| Namespace | Event | Payload | Emitted by |
| --- | --- | --- | --- |
| `/chat` | `chat:new` | chat message row | chat service on post |
| `/live` | `vote:new` | `{ event, totals }` | wallet/vote service |
| `/live` | `gift:new` | `{ gift, from, to }` | gift service |
| `/live` | `focus:changed` | `{ forced_focus_participant_id }` | competition/duel controller |
| `/live` | `performer:changed` | `{ current_performer_id, duration }` | competition controller |
| `/live` | `sponsor:ad` | `{ action: 'start'\|'stop', ad }` | sponsor service |
| `/live` | `event:reminder` | `{ concert_id \| competition_id }` | `event-reminders` job |
| `/live` | `competition:finished` | `{ competition_id }` | `close-competitions` job |
| `/live` | `leaderboard:update` | `{ season_id, type, user_id }` | leaderboard ZSET bump (vote/gift) |
| `/notifications` | `notification:new` | `{ id, type, title, message, data, created_at }` | `notifyUser` (jobs + services) |

## Emit helpers (`bus.js`)

```js
import { emitToRoom, emitToUser, roomName } from '../realtime/bus.js';

emitToRoom('/live', roomName('competition', id), 'focus:changed', payload);
emitToUser(userId, 'notification:new', payload);
```

Every helper is a safe no-op when realtime is not attached (unit tests, CLI).
