# Architecture Decision Records (ADR)

Numbered records for every non-trivial choice. Each: context → decision →
consequences.

---

## ADR-0001 — Backend replaces Supabase; frontend is the source of truth

**Context.** The existing frontend (web, ~330 files) and the upcoming mobile app
are built against Supabase: ~72 tables via `.from()`, ~60 RPCs via `.rpc()`, 30
edge functions, realtime channels, GoTrue auth and Storage. The mandate is a
Node/Express/Sequelize/MySQL backend that serves the existing frontend **and**
mobile end-to-end.

**Decision.** Treat the frontend's generated `types.ts` (post-migration Postgres
schema) and its `.rpc()/.from()/.functions.invoke()` call-sites as the binding
contract. Reproduce every table, procedure and function faithfully. Build a
**clean REST API** (mobile-first) rather than emulating Supabase's wire
protocol.

**Consequences.** The web frontend is migrated off `@supabase/supabase-js` via a
thin API adapter (delivered with the client-integration phase). One backend
serves both clients. No Supabase/PostgREST/GoTrue coupling.

## ADR-0002 — JavaScript (ESM), not TypeScript

**Context.** The reference spec suggested TypeScript strict; the team requested
JS with `controllers/routes/models`, sequelize-cli and Joi.

**Decision.** Node 20 **ES modules in JavaScript**, with thorough JSDoc/TSDoc on
every function and `// @ts-check`-friendly typedefs for editor safety.

**Consequences.** Faster iteration and simpler sequelize-cli scaffolding; type
safety is provided by JSDoc + ESLint rather than the compiler.

## ADR-0003 — Schema generated from `types.ts`

**Context.** ~72 content tables must be modeled consistently and kept in sync
with the frontend.

**Decision.** `scripts/generate-schema.js` parses `types.ts` and emits: one
Sequelize model per table, a single reversible init migration, and a
`belongsTo`-per-FK associations file. A curated type-map resolves ambiguities
lost in TS (`Json`→JSON, `number`→INTEGER/DECIMAL by name, `string`→UUID/DATE/
TEXT/STRING by name), with per-column overrides.

**Consequences.** 81 models + 231 indexes + 117 FKs generated consistently;
regenerate with one command when the frontend schema evolves. Auth tables and
hot-path reverse relations are hand-authored. Best-effort DB defaults are
enforced authoritatively by services.

## ADR-0004 — MySQL has no RLS → app-layer RBAC/ABAC

**Context.** Supabase security relied on Postgres Row-Level Security.

**Decision.** Enforce authorization in the app: `requireRole()` (RBAC, roles in
`user_roles` only) + `canModerate()`/resource checks (ABAC) in services. RLS
policies become middleware + service guards.

**Consequences.** Authorization is explicit and testable; every protected route
declares its policy.

## ADR-0005 — Auth: first-party identity, RS256 JWT, rotating refresh

**Context.** GoTrue is gone; frontend user id must remain the profile id.

**Decision.** New `users` table is the identity source of truth; `users.id ==
profiles.id`. Access JWT (15 min) signed **RS256** in production (HS256 fallback
in dev so it boots keyless), rotating **hashed** refresh tokens (30 d) with
Redis revocation by `jti`. Phone verification via OTP.

**Consequences.** Frontend keeps using a stable user id; tokens are revocable;
no plaintext refresh tokens at rest.

## ADR-0006 — Atomic money via stored procedures

**Context.** Credit movements (votes, gifts, purchases, payouts) must be atomic;
the spec requires `SELECT … FOR UPDATE` + transactions or stored procedures.

**Decision.** Reproduce the financial Supabase RPCs as MySQL stored procedures
(`src/procedures/*.sql`, applied idempotently) that lock the wallet row and
commit atomically. Services `CALL` them; they never do ad-hoc balance UPDATEs.

**Consequences.** `modules/wallet` and `modules/payments` correctness is
concentrated in reviewed, testable procedures. First one delivered:
`deduct_wallet_and_vote`; the rest ship with their modules.

## ADR-0007 — Single init migration, FK-safe ordering

**Context.** 85 tables with 120 FKs; MySQL requires referenced tables to exist.

**Decision.** Auth migration (`0000`) creates `users` et al. first; the content
migration (`0001`) creates all tables (columns + PK) **then** adds indexes and
FKs in a second pass, avoiding topological ordering. `down` drops with
`FOREIGN_KEY_CHECKS=0`. Both directions are reversible.

**Consequences.** Deterministic, reversible schema bring-up; validated to
compile to MySQL DDL (85 CREATE TABLE, 237 index ops, 120 FK ops).

## ADR-0008 — Redis optional in development

**Decision.** With `REDIS_OPTIONAL=true`, rate-limit/blacklist/queue features
degrade gracefully to in-process fallbacks when Redis is unreachable, so `npm
run dev` works with zero infra.

**Consequences.** Production sets `REDIS_OPTIONAL=false` to require Redis.

## ADR-0009 — OpenAPI generated in-house from Joi (no zod-to-openapi)

**Context.** The reference spec assumed Zod + `zod-to-openapi` for the OpenAPI
3.1 doc and Swagger UI on `/docs`. The team standardized on **Joi** for
validation, and the CI/dev environment has **no npm registry access**
(`swagger-ui-express`, `joi-to-swagger` could not be installed).

**Decision.** Ship a dependency-free OpenAPI stack:
- `src/openapi/joiToSchema.js` — a minimal Joi→OpenAPI converter driven by Joi's
  public `schema.describe()` AST (stable across patch versions), covering the
  subset in use (object/string/number/boolean/array/date, `valid()` enums,
  `required`, `allow(null)`, uuid/email/uri formats, min/max/length).
- `src/openapi/build.js` — generates the spec by **introspecting each router's
  Express stack**: paths + methods from route layers; auth/roles/request-schemas
  from metadata that `authenticate`/`requireRole`/`validate` attach to their
  middlewares (`__auth`, `__roles`, `__schemas`), including router-level
  `router.use(authenticate())` defaults.
- `/api/v1/openapi.json` serves the spec; `/docs` serves a **self-contained**
  Swagger-style explorer (inline CSS/JS, its own CSP, zero external assets).
- `npm run docs:openapi` writes `docs/openapi.json`; CI runs it (fails if a
  router fails to load).

**Consequences.** The spec stays in lock-step with the real routes — a new
endpoint is documented the moment it is mounted (currently 151 paths / 186
operations). No added dependency. `openapi.json` remains 100% standard and
importable into a real Swagger UI / Postman / codegen if desired later. Trade-off:
the built-in `/docs` viewer is read-only (no "try it out"); use the exported
spec in Swagger UI for interactive calls.

## ADR-0010 — Background jobs: BullMQ, with a dependency-free cron fallback

**Context.** Scheduled work is required (event reminders, monthly badges, admin
daily report, exchange-rate refresh, competition auto-close, webhook retries).
The spec named BullMQ + Redis with a `node-cron` fallback when Redis is absent
in dev. `node-cron` could not be installed (no registry access), and adding a
dependency for a dev-only fallback is undesirable.

**Decision.** One orchestrator (`src/jobs/index.js`) with two interchangeable
runtimes behind `startJobs()`/`stopJobs()`: **BullMQ + Redis** when reachable
(repeatable jobs + dispatching worker, survives restarts), else an **in-process
scheduler** — a 60 s tick evaluating each job's cron via a **hand-written 5-field
cron matcher** (`src/jobs/cron.js`, UTC, wildcard/step/list/range) with a
per-job re-entrancy guard. Both runtimes call the same idempotent handlers.

**Consequences.** Zero new dependency; `npm run dev` runs jobs with no Redis.
Every handler is idempotent (reminder rows, badge replace, procedure no-ops) so
either runtime — or an overlap — is safe. Cron JSDoc must avoid the literal
`*/n` sequence (it closes a block comment); documented in the module.

## ADR-0011 — Withdrawal PIN hashed with bcrypt (cost 12), not SHA-256

**Context.** The legacy Supabase `hash_pin` stored the withdrawal PIN as
`sha256(user_id || ':' || pin || ':salt')` (a fast, unsalted-per-secret hash).
The security checklist mandates bcrypt cost 12 for secrets, and this is a
greenfield backend with **no existing PIN data to migrate**.

**Decision.** Hash the 6-digit withdrawal PIN with **bcrypt (cost 12)**, reusing
`utils/password.js`. Enforce a lockout after 5 failed attempts (15 min) and an
emailed-OTP reset flow (`WithdrawalPinResetToken`, HMAC-hashed, 15-min expiry,
constant-time compare).

**Consequences.** PINs are slow-to-brute-force and per-secret salted, consistent
with password hashing. Diverges intentionally from the frontend's legacy scheme;
acceptable because no legacy PIN hashes exist. Additionally, PIN verification is
enforced **server-side** before any reserve (the legacy flow verified only
client-side).

## ADR-0012 — Port bugs found and fixed via test-driven development

**Context.** Porting Supabase inserts to Sequelize models surfaced several
latent defects — writes that would also fail on production MySQL, not just the
SQLite test DB. They were caught while writing the wallet/payments/sponsor unit
tests (100% money-module coverage target).

**Decision.** Fix each at the service layer and lock it with a test:
- `initCinetpay` inserted a `cinetpay_transactions` row without `payment_method`
  and with `phone_number: null`, both **NOT NULL** → default the channel to
  `'ALL'` and phone to `''`.
- `sponsor.createRequest` inserted `description: null` into a **NOT NULL** column
  → default `''`.
- `sponsor.reviewRequest` passed an **array** `[request.id]` into
  `source_request_ids` (a **STRING** column) → store the id string.
- `referral`/`withdrawal` config reads used `{ raw: true }` on a JSON column,
  which returns a **string on SQLite** (mysql2 parses it, so prod was fine) →
  drop `raw` so the JSON getter parses on every dialect.

**Consequences.** These flows now work on MySQL and are regression-guarded. A
related, deliberately-unimplemented case is documented here: a **paid-then-
rejected sponsor request** is refunded **out-of-band by an admin** — there is no
automatic refund procedure, because the reserve/settle model keeps funds safe
(payment sets `paid_at`; rejection only blocks approval) and automatic sponsor
refunds were out of scope.

**Addendum — bugs found during real `docker compose` validation** (only
reproducible against MySQL, since unit tests run on SQLite / mock the procedure
layer):
- **`callProcedure` awaited a callback-style connection.** Sequelize's
  `connectionManager.getConnection()` returns a raw mysql2 connection whose
  `.query()` is callback-based; `await`-ing it threw *"…not a promise"* **after**
  the `CALL` had already run — so every financial procedure (votes, gifts,
  tickets, withdrawals, referrals, sponsor pay, webhook credits) executed the
  debit **then returned HTTP 500**, and the idempotency layer then freed the key
  (treating it as failed) → a retry double-charged. Fixed by using
  `conn.promise()`. Verified end-to-end: purchase debits once and a repeated
  `Idempotency-Key` replays the stored response with no second debit.
- **`admin_logs.admin_id` was NOT NULL but had an `ON DELETE SET NULL` FK**, which
  MySQL rejects (the `0001` migration failed). The generator now forces
  reviewer/optional FK columns (`USER_REVIEWER_COLS`) nullable, so the column and
  its SET-NULL constraint agree — and `admin_id` being nullable matches the
  service (system actions log `admin_id = null`).

## ADR-0013 — Uploads via server-presigned S3 URLs

**Context.** The frontend uploaded directly to Supabase Storage buckets
(`uploads`, `sponsor-media`). The spec requires S3-compatible storage with
server-side presignature, MIME/size validation and expiring URLs.

**Decision.** `POST /uploads/presign` issues a presigned **PUT** (client uploads
directly to S3/R2, offloading bandwidth) with a **server-generated key**
(nanoid + sanitized extension → no path traversal/overwrite), a per-category
allowlist (MIME group + size cap), and the declared `Content-Type` pinned into
the signature. Private objects (premium replays) use `POST
/uploads/presign-download` for a short-lived **GET**. `forcePathStyle` supports
R2/MinIO. Missing config → clean `503`.

**Consequences.** No file bytes transit the API on upload. Byte-level validation
is handled after upload — see ADR-0014.

## ADR-0014 — Post-upload magic-byte validation + optional ClamAV

**Context.** Presigned direct uploads mean the file bytes never pass through the
API, so MIME magic-byte validation and antivirus scanning cannot happen at the
`presign` step (only the declared Content-Type is pinned to the signature).

**Decision.** Add a `POST /uploads/confirm` step the client calls after the PUT.
The server: (1) enforces ownership from the key layout `<prefix>/<userId>/<id>`;
(2) reads the object's leading bytes (`GetObject Range: bytes=0-1023`) and
validates the **real** type via a magic-byte detector
(`src/utils/fileType.js` — JPEG/PNG/GIF/WEBP/BMP/PDF/MP4/WEBM/AVI), rejecting
mismatches (415) and **deleting** the object; (3) optionally scans bounded-size
categories (image/pdf, not large video) via a `clamd` INSTREAM hook
(`src/services/clamav.service.js`), deleting infected objects (422). ClamAV is
**off by default** (`CLAMAV_ENABLED`) and **fails open** on scanner
outage — it is a defense-in-depth layer, not a hard dependency.

**Consequences.** A file renamed `.jpg` but not actually an image is rejected and
removed; malware is caught when ClamAV is enabled. Trade-off: large videos are
not AV-scanned inline (size) — an async post-upload scan job is the future step.

## ADR-0015 — Soft delete (paranoid) on user-content tables, via the generator

**Context.** §5 requires soft delete on user content and hard delete on
secrets/logs. Models are code-generated from `types.ts` (ADR-0003), so the
soft-delete flag must survive regeneration rather than be hand-patched.

**Decision.** A curated `PARANOID_TABLES` set in `scripts/generate-schema.js`
(`comments`, `blogs`, `lifestyle_videos`, `replay_videos`) makes the generator
emit `paranoid: true, deletedAt: 'deleted_at'` (with `timestamps:true,
createdAt:false, updatedAt:false`) plus a `deleted_at` column. Migration `0003`
adds the column + index to the existing tables. `destroy()` now soft-deletes and
reads exclude removed rows; `paranoid:false` still surfaces them for audit, and
`restore()` undeletes.

**Consequences.** User content is recoverable and auditable; regenerating the
schema preserves the behavior. Financial/audit/secret tables stay hard-delete.
The set can be extended (e.g. chat messages) by adding to `PARANOID_TABLES` +
a follow-up migration.

## ADR-0016 — Real-time leaderboards on Redis ZSET (SQL fallback)

**Context.** §2 calls for real-time leaderboards via Redis ZSET. The
authoritative ranking is the SQL aggregation `get_season_leaderboard`
(ADR reproduced in `leaderboard.service`), but recomputing it on every read
doesn't scale for live "votes/gifts" dashboards.

**Decision.** Add `src/services/leaderboard.realtime.js`: a Redis **sorted set**
per active season (`lb:<type>:<seasonId>`, member = userId, score = points).
Wallet operations bump it incrementally after a successful vote/gift
(`recordVote`/`recordGift`, weights mirroring the SQL scoring:
artist `votes*10 + gifts*5 + wins*50`, donor `1:1`). `GET
/leaderboards/seasons/:id/live` reads `ZREVRANGE` for instant top-N; on a cold
cache it rebuilds the ZSET from the SQL leaderboard (cache-aside), and when Redis
is unavailable it falls back to SQL entirely. A `leaderboard:update` event is
broadcast to the `leaderboard:<seasonId>` Socket.IO room.

**Consequences.** O(log n) writes + instant reads for live rankings, with the SQL
leaderboard remaining the source of truth (full breakdown via
`/ranking`). All writes are best-effort — a Redis outage never breaks the
financial operation, only degrades the live board to SQL. Wins (+50) are wired
where a duel winner is set (optional `recordWin`).
