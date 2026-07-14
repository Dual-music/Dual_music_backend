# Dual Music — Backend REST API

First-party REST + realtime backend for **Dual Music**, a social music‑streaming
platform (duels, concerts, lives, competitions, virtual economy, payments).
It replaces the frontend's former Supabase backend with a **Node.js · Express ·
Sequelize · MySQL 8** stack, and is designed to serve **both the web app and the
future mobile app** from one clean API.

> Status: **Phase 1 — Foundation delivered** (project, config, security
> middleware, full database schema: 85 tables as Sequelize models + reversible
> migrations + associations + the first atomic stored procedure). Feature
> modules (auth → wallet → events → …) are delivered next, in the order below.

---

## 1. Requirements

- **Node.js 20 LTS** (uses ESM; `engines` enforces `>=20`)
- **MySQL 8** (utf8mb4 / `utf8mb4_0900_ai_ci`, UTC)
- **Redis 7** (optional in dev — see `REDIS_OPTIONAL`)
- Docker + Docker Compose (optional, recommended for local infra)

## 2. Quickstart

### Option A — Docker (everything: MySQL, Redis, MailHog, API)

```bash
cp .env.example .env      # adjust DB_PASSWORD etc.
docker compose up --build # → API on http://localhost:4000, MailHog on :8025
```

The `api` service runs migrations + procedures + seeds, then starts.

### Option B — Local Node against your own MySQL/Redis

```bash
cp .env.example .env      # point DB_* / REDIS_URL at your services
npm install
npm run db:create         # create the database (if missing)
npm run db:migrate        # apply 0000-init-auth + 0001-init-content-schema
npm run db:procedures     # install stored procedures
npm run db:seed           # seed roles, gifts, CinetPay countries, …
npm run dev               # start with hot-reload (nodemon)
```

Health check: `GET http://localhost:4000/api/v1/health` → `{ "data": { "status": "ok" } }`.

## 3. NPM scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `start` | Start API (watch / production) |
| `npm run db:generate:schema` | Regenerate models + content migration + associations from the frontend `types.ts` |
| `npm run db:migrate` / `:undo` / `:undo:all` / `:status` | Sequelize CLI migrations |
| `npm run db:procedures` | Apply `src/procedures/*.sql` stored procedures |
| `npm run db:seed` / `:undo` | Seeders |
| `npm run db:reset` | Undo all → migrate → procedures → seed |
| `npm run lint` / `format` / `test` | ESLint · Prettier · Vitest |

## 4. Project structure

```
src/
├── config/        env (Joi-validated), sequelize, redis, logger, config.cjs (CLI)
├── models/
│   ├── tables/    81 generated models (from frontend schema) + registry
│   ├── auth.models.js         users, refresh_tokens, otp_codes, oauth_accounts
│   ├── associations.generated.js  belongsTo per FK (generated)
│   ├── associations.js        auth + hot-path hasMany + profile 1:1
│   └── index.js               model registry → `db`
├── migrations/    0000-init-auth.cjs, 0001-init-content-schema.cjs
├── procedures/    atomic financial stored procedures (*.sql)
├── seeders/       roles, gifts, countries, plans, …
├── middlewares/   requestId, language, rateLimit, validate, auth, rbac, errorHandler
├── controllers/   HTTP handlers (thin) — added per module
├── routes/        routers (`/api/v1/...`) — added per module
├── validations/   Joi schemas — added per module
├── services/      business logic (transactions, procedures) — added per module
├── realtime/      Socket.IO namespaces — added later
├── jobs/          BullMQ workers/schedulers — added later
├── utils/         ApiError, apiResponse, pagination, money, jwt
├── i18n/          FR/EN error catalog
├── app.js         Express app factory
└── server.js      HTTP + graceful shutdown
scripts/           generate-schema.js, apply-procedures.js
docs/              ARCHITECTURE.md, DECISIONS.md
```

## 5. Conventions

- **REST**: `/api/v1/...`, plural kebab-case resources, precise status codes,
  cursor pagination (`?cursor=&limit=`) by default, `?page=&pageSize=` optional.
- **Uniform envelopes**: success `{ data, meta: { requestId, pagination? } }`,
  error `{ error: { code, message, details? } }` with FR/EN messages via
  `Accept-Language`.
- **Auth**: JWT (RS256 in prod, HS256 dev fallback), rotating hashed refresh
  tokens, Redis revocation. Roles live only in `user_roles`.
- **Money**: 1 credit = 0.50 €. All credit movements go through atomic stored
  procedures / `SERIALIZABLE` transactions — never ad-hoc UPDATEs.
- **Idempotency**: `Idempotency-Key` header required on financial POSTs.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/DECISIONS.md`](docs/DECISIONS.md) for the full rationale.

## 6. Delivered modules & endpoint matrix

Import [`docs/postman/DualMusic.postman_collection.json`](docs/postman/DualMusic.postman_collection.json)
into Postman (Register/Login auto-save the tokens). Envelope: success
`{ data, meta }`, error `{ error: { code, message } }`.

| Module | Key endpoints (prefix `/api/v1`) |
| --- | --- |
| **auth** ✅ | `POST /auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` · `POST /auth/otp/phone/{send,verify}` · `/auth/password/{forgot,reset,change}` · `GET /auth/oauth/google[/callback]` |
| **users** ✅ | `POST /users/display-profiles` · `GET /users/:id` · `PATCH /users/me` · `GET /users/me/preferences` · `PUT /users/me/preferences/currency` · `POST\|DELETE /users/:id/follow` · `GET /users/me/following` |
| **creators** ✅ | `GET /artists` · `POST /artists/requests` · `GET /artists/requests` · `POST /artists/requests/:id/review` · `PATCH /artists/me` · `POST /managers/requests` · `POST /managers/requests/:id/review` |
| **wallet** ✅ | `GET /wallet` · `GET /wallet/revenues[/breakdown]` · `POST /wallet/vote` · `/wallet/gifts/{purchase,send}` · `/wallet/tickets/{duel,concert}` · `/wallet/replays/unlock` |
| **payments** ✅ | `POST /payments/{cinetpay,moneroo}/init` · `/payments/stripe/{credits,subscription}` · `POST /payments/{cinetpay,moneroo,stripe}/webhook` |
| **gifts** ✅ | `GET /gifts` · `GET /gifts/inventory` · `GET /gifts/top-donor` |
| **duels** ✅ | `GET /duels` · `POST /duels` · `GET /duels/:id` · `PATCH /duels/:id` · `GET /duels/:id/votes` · `POST /duels/requests[/:id/respond]` · `GET /duels/requests/mine` · chat `:id/messages` |
| **lives** ✅ | `GET /lives` · `POST /lives` · `GET /lives/:id` · `POST /lives/:id/{end,likes,join}` · `POST /lives/join-requests/:id/respond` · chat |
| **concerts** ✅ | `GET/POST /concerts` · `GET /concerts/:id` · `GET/POST /artist-concerts` · `POST /artist-concerts/:id/review` · chat |
| **competitions** ✅ | `GET/POST /competitions` · `GET /competitions/:id[/candidates]` · `POST /competitions/:id/{publish,apply,performer,focus,finalize,vote,gifts,tickets}` · `POST /competitions/candidates/:id/review` · chat |

### Atomic financial procedures (MySQL, `src/procedures/`)
`deduct_wallet_and_vote`, `purchase_gift_from_wallet`, `send_gift_with_distribution`,
`purchase_{duel,concert}_ticket_from_wallet`, `purchase_replay_access_from_wallet`,
`distribute_event_revenue` (revenue-split engine), `cinetpay_credit_wallet`,
`moneroo_credit_wallet`, `credit_wallet_stripe`, `competition_vote`,
`send_competition_gift`, `purchase_competition_ticket`.

## 7. Remaining (roadmap)

Realtime (Socket.IO namespaces `/chat`, `/live`, `/notifications`), BullMQ jobs
(reminders, monthly badges, exchange-rate refresh, competition auto-close,
webhook retries), LiveKit token endpoint, sponsors/ads, moderation/reports/bans,
notifications (Web Push), leaderboards, admin dashboard, OpenAPI/Swagger, full
Vitest+Supertest suite and GitHub Actions CI.
