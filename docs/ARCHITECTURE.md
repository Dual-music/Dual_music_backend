# Architecture

Clean, layered architecture: **route → validate → controller → service →
repository/model → MySQL**. Controllers stay thin (no business logic); no
Sequelize query lives outside a service/repository.

## Module map

```mermaid
graph TD
  subgraph Clients
    Web[Web app]
    Mobile[Mobile app]
  end

  Web -->|HTTPS REST /api/v1| API
  Mobile -->|HTTPS REST /api/v1| API
  Web -->|WSS| RT[Socket.IO]
  Mobile -->|WSS| RT

  subgraph API[Express API]
    MW[Middleware: requestId · i18n · helmet/cors · rateLimit · auth · rbac · validate]
    R[Routes /api/v1/*]
    C[Controllers]
    S[Services]
    Repo[Repositories / Sequelize models]
    MW --> R --> C --> S --> Repo
  end

  Repo --> DB[(MySQL 8)]
  S --> Proc[[Stored procedures\natomic money]]
  Proc --> DB
  S --> Cache[(Redis: cache · rate-limit · revocation · ZSET leaderboards)]
  RT --> Cache
  Jobs[BullMQ workers/schedulers] --> DB
  Jobs --> Ext

  subgraph Ext[External services]
    LK[LiveKit]
    Pay[CinetPay · Moneroo · Stripe]
    S3[(S3 / R2 storage)]
    Mail[SMTP / Resend]
    Push[Web Push VAPID]
  end
  S --> Ext
```

## Auth flow

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as MySQL
  participant R as Redis
  C->>A: POST /auth/register (email, phone, password)
  A->>DB: create user (+ profile, wallet), hash password (bcrypt 12)
  A->>C: send OTP (SMS/email)
  C->>A: POST /auth/verify-otp
  A->>DB: mark phone_verified
  C->>A: POST /auth/login
  A->>DB: verify credentials
  A->>DB: store hashed refresh token (30d)
  A->>C: access JWT (15m, RS256) + refresh token
  C->>A: POST /auth/refresh (rotate)
  A->>R: check/revoke jti; A->>DB: rotate token
  A->>C: new access + refresh
```

## Payment flow (recharge)

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant P as Provider (CinetPay/Moneroo/Stripe)
  participant DB as MySQL
  C->>A: POST /payments/{provider}/init (Idempotency-Key)
  A->>DB: create pending credit_purchase (merchant_transaction_id)
  A->>P: init transaction
  P-->>A: payment URL / token
  A-->>C: redirect/checkout URL
  P->>A: webhook (signed)
  A->>A: verify HMAC + timestamp; check webhook_events idempotency
  A->>DB: CALL credit_wallet(...) atomically; mark purchase paid
  A-->>P: 200 OK
```

## Competition live flow

```mermaid
sequenceDiagram
  participant M as Manager
  participant A as API
  participant RT as Socket.IO
  participant V as Viewers
  M->>A: publish competition → select candidates
  M->>A: set forced_focus_participant_id
  A->>DB: persist focus
  A->>RT: broadcast focus change
  RT->>V: all viewers focus that performer
  V->>A: pay vote / send gift (atomic procedure)
  A->>RT: live tallies update
  M->>A: finalize_competition_ranking → rewards
```
