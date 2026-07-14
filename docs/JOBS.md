# Background Jobs (`src/jobs`)

Scheduled work runs through one orchestrator (`src/jobs/index.js`) with two
interchangeable runtimes, chosen automatically at boot:

| Runtime | When | Behaviour |
| --- | --- | --- |
| **BullMQ + Redis** | Redis reachable | One `dual-music` queue holds repeatable jobs; a `Worker` dispatches by name. Survives restarts, retries, history. |
| **In-process cron** | Redis absent (dev) | A 60 s tick evaluates each job's cron (UTC) via `src/jobs/cron.js` and runs due handlers, with a per-job re-entrancy guard. |

Both runtimes call the exact same idempotent handlers in `src/jobs/handlers.js`.

## Job registry (`JOB_DEFINITIONS`)

| Name | Cron (UTC) | Handler | Effect |
| --- | --- | --- | --- |
| `refresh-exchange-rates` | `0 4 * * *` | `refreshExchangeRates` | Fetches fiat rates, normalizes to `rate_per_usd`, upserts `exchange_rates`. |
| `event-reminders` | `*/5 * * * *` | `sendEventReminders` | Notifies ticket holders of concerts/competitions starting within 30 min (at-most-once via `*_reminders`). |
| `close-competitions` | `*/2 * * * *` | `closeCompetitions` | Flips `live` competitions past `end_at` to `finished`; emits `competition:finished`. |
| `retry-webhooks` | `*/3 * * * *` | `retryWebhooks` | Reconciles `pending` CinetPay pay-ins via provider check + idempotent credit procedure. |
| `assign-monthly-badges` | `0 2 1 * *` | `assignMonthlyBadges` | Ranks monthly donors (gifts + paid votes), rewrites Top-Donor badges. |
| `admin-daily-report` | `30 6 * * *` | `adminDailyReport` | Aggregates prior-day KPIs into `admin_logs` + emails admins. |

## Idempotency guarantees

- **Reminders** — a `sent=true` reminder row is the dedup key; re-runs skip.
- **Monthly badges** — deletes the month's monthly badges before re-inserting.
- **Webhook retry / credit** — the `cinetpay_credit_wallet` stored procedure is a
  no-op once the transaction is `success`, so double-credit is impossible.
- **Exchange rates** — pure upsert by `currency_code`.

## Env

| Var | Default | Meaning |
| --- | --- | --- |
| `REDIS_URL` | `redis://127.0.0.1:6379` | BullMQ + cache connection. |
| `REDIS_OPTIONAL` | `true` | When `true`, a missing Redis silently activates the in-process cron fallback. |
| `EXCHANGE_RATE_API_URL` | open.er-api.com/EUR | Source for `refresh-exchange-rates`. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | Enable Web Push fan-out in `notifyUser`. |

Graceful shutdown drains the worker/queue (or clears the timer) via `stopJobs()`.
