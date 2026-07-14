# Déploiement — Backend « Dual Music »

Node 20 · Express · Sequelize · MySQL 8 · Redis 7. API exposée sur le port
`4000` sous `/api/v1`.

---

## 1. Prérequis

| Composant | Version | Rôle |
|---|---|---|
| Node.js | ≥ 20 LTS | runtime |
| MySQL | 8.0 (utf8mb4, `time_zone=+00:00`) | base de données |
| Redis | 7 | rate-limit, blacklist JWT, BullMQ (optionnel en dev) |
| SMTP / Resend | — | emails transactionnels (MailHog en dev) |
| S3 / R2 | — | avatars, replays, médias sponsors |

## 2. Configuration (`.env`)

`dotenv-safe` **bloque le démarrage** si une variable listée dans
[`.env.example`](../.env.example) manque. Copiez puis renseignez :

```bash
cp .env.example .env
```

Variables sensibles à définir en production (voir [SECURITY.md](SECURITY.md)) :
`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (RS256), `TOKEN_HASH_SECRET`,
`DB_PASSWORD`, `REDIS_URL`, `CINETPAY_*`, `MONEROO_*`, `STRIPE_*`,
`LIVEKIT_*`, `S3_*`, `VAPID_*`, `CORS_ORIGINS`. Ne jamais committer `.env`.

## 3. Démarrage local (Docker Compose)

`docker compose up` lève **api + mysql + redis + mailhog**, applique migrations,
procédures et seeders, puis démarre l'API :

```bash
docker compose up --build
# API   : http://localhost:4000/api/v1/health
# Docs  : http://localhost:4000/docs
# Mail  : http://localhost:8025  (MailHog UI)
```

Le service `api` exécute au boot :
`npm run db:migrate && npm run db:procedures && npm run db:seed && npm start`.

## 4. Démarrage local (sans Docker)

```bash
npm install
cp .env.example .env            # renseigner DB_* au minimum
npm run db:create               # crée la base
npm run db:migrate              # schéma (up)
npm run db:procedures           # procédures stockées atomiques
npm run db:seed                 # rôles, gifts, settings, pays CinetPay
npm run dev                     # nodemon (Redis optionnel → fallbacks in-process)
```

## 5. Base de données — cycle de vie

| Commande | Effet |
|---|---|
| `npm run db:migrate` | applique les migrations (`0000` auth → `0001` contenu → `0002` idempotence/webhooks) |
| `npm run db:migrate:undo:all` | rollback complet (réversible, FK-safe) |
| `npm run db:procedures` | (ré)applique `src/procedures/*.sql` (idempotent) |
| `npm run db:seed` | données de référence |
| `npm run db:reset` | undo:all → migrate → procedures → seed |

> Les migrations et procédures sont **idempotentes/réversibles** ; le job CI
> `migrate-check` valide `up → down → up` sur un MySQL 8 réel.

## 6. Build & image Docker

Dockerfile **multi-stage** (`deps` → `build` → `run`), exécuté en **utilisateur
non-root** :

```bash
docker build -t dual-music-api:latest .
docker run --env-file .env -p 4000:4000 dual-music-api:latest
```

## 7. Mise en production (checklist)

1. `REDIS_OPTIONAL=false` (Redis requis pour rate-limit/blacklist/queue).
2. `NODE_ENV=production` → CSP Helmet stricte activée, HSTS.
3. Clés **RS256** réelles (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`) — pas de fallback HS256.
4. `CORS_ORIGINS` = domaines front web + app mobile uniquement.
5. Webhooks : URLs publiques `/api/v1/payments/{cinetpay,moneroo,stripe}/webhook`
   déclarées chez chaque prestataire ; secrets de signature configurés.
6. S3/R2 : bucket privé + `S3_PUBLIC_BASE_URL` (CDN) pour les contenus publics.
7. Migrations appliquées avant le démarrage (le compose le fait ; en k8s, un
   `initContainer` ou job de migration).
8. Observabilité : logs Pino JSON (corrélation `x-request-id`) agrégés ; healthcheck
   `/api/v1/health` (liveness) et `/api/v1/ready` (readiness — vérifie la DB).

## 8. Jobs planifiés

Au démarrage, `startJobs()` choisit **BullMQ + Redis** si disponible, sinon un
**scheduler in-process** (voir [JOBS.md](JOBS.md)). En multi-instances, Redis est
requis pour éviter que chaque réplique exécute les crons (BullMQ dédoublonne via
`jobId` répétable).

## 9. Mise à l'échelle

- L'API est **stateless** (JWT + Redis) → scalable horizontalement derrière un LB.
- Le temps réel Socket.IO en multi-instances nécessite l'**adapter Redis**
  (`@socket.io/redis-adapter`) — à activer si > 1 réplique (non requis en mono-instance).
- MySQL : réplicas lecture pour les listes/leaderboards si besoin.

## 10. Sauvegarde & restauration

- MySQL : `mysqldump` planifié (le volume `mysql_data` persiste en dev).
- Wallet append-only + procédures atomiques garantissent la cohérence financière ;
  conserver les tables `credit_purchases`, `revenue_distributions`,
  `withdrawal_requests`, `webhook_events` pour l'audit.
