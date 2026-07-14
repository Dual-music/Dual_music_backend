# Sécurité — Backend « Dual Music »

Modèle de sécurité applicative et checklist. Voir aussi [DECISIONS.md](DECISIONS.md)
(ADR sécurité) et [COMPLIANCE.md](COMPLIANCE.md) (statut point par point).

---

## 1. Authentification & sessions

- **Mots de passe** : bcrypt cost 12 ([`password.js`](../src/utils/password.js)),
  jamais renvoyés par l'API.
- **JWT access** (15 min) signé **RS256** en production (clés `JWT_*` dans les
  secrets ; fallback HS256 en dev pour booter sans clés). Vérification via
  [`jwt.js`](../src/utils/jwt.js).
- **Refresh tokens** (30 j) **rotatifs** et stockés **hashés**
  ([`token.service.js`](../src/services/token.service.js)) ; réutilisation d'un
  token consommé ⇒ rejet (détection de rejeu). Révocation via **blacklist Redis**
  par `jti`.
- **OTP** téléphone/email : hashés (HMAC), TTL court, comparaison à temps constant
  ([`otp.service.js`](../src/services/otp.service.js)).
- **PIN de retrait** : bcrypt cost 12, verrouillage après 5 échecs (15 min),
  reset par OTP email — vérifié **côté serveur** avant toute réservation de fonds
  ([ADR-0011](DECISIONS.md)).

## 2. Autorisation (RBAC + ABAC)

- **RBAC** : `requireRole('admin'|…)` ; les rôles vivent **uniquement** dans
  `user_roles` (jamais sur `users`/`profiles`) — [`rbac.js`](../src/middlewares/rbac.js).
- **ABAC** : `canModerate(actor, roles, targetId)` + vérifs de propriété dans les
  services (ex. replays, méthodes de retrait, notifications owner-scoped).
- Bans **plateforme** (`users.is_banned`, bloqué à chaque requête) vs **événement**
  (`stream_bans`/`competition_bans`), jamais confondus.

## 3. Sécurité financière

- **Débits atomiques** via procédures MySQL verrouillées (`… FOR UPDATE` +
  transaction) — [`src/procedures/`](../src/procedures). Aucun `UPDATE` de solde
  ad-hoc.
- **Idempotence** :
  - Header **`Idempotency-Key` obligatoire** sur les POST financiers
    ([`idempotency.js`](../src/middlewares/idempotency.js)) — la réponse est
    rejouée sur retry (pas de double débit) ; réutilisation avec payload différent
    ⇒ 409.
  - **Webhooks** : ledger `webhook_events` (traité-une-fois par
    `provider + external_id`) — [`webhook.service.js`](../src/services/webhook.service.js).
- **Retraits** : réservation (débit) à la demande, **remboursement atomique** au
  refus (`revert_withdrawal`), idempotent.

## 4. Webhooks de paiement

- **Signature vérifiée** : HMAC Moneroo ([`moneroo.client.js`](../src/services/payments/providers/moneroo.client.js)),
  `constructEvent` Stripe (tolérance d'horodatage 5 min intégrée).
- **Re-vérification serveur-à-serveur** : CinetPay/Moneroo re-interrogés avant de
  créditer — le corps du webhook n'est **jamais** cru sur parole.
- **Anti-rejeu** : `webhook_events` + procédures de crédit idempotentes.

## 5. Uploads

- URLs **présignées côté serveur** (PUT), clé **générée serveur** (nanoid + extension
  assainie ⇒ pas de path traversal / overwrite) — [`upload.service.js`](../src/services/upload.service.js).
- Allowlist **MIME par catégorie** + **taille max** ; `Content-Type` épinglé dans la
  signature ; objets privés (replays premium) via GET présigné expirant.
- *À renforcer* : validation **magic-bytes** et antivirus (hook ClamAV) — voir
  [ADR-0013](DECISIONS.md).

## 6. Entrées & injections

- **SQLi** : ORM Sequelize + requêtes paramétrées uniquement (aucun échappement manuel).
- **Mass assignment** : DTO **Joi** avec `stripUnknown` — seuls les champs déclarés
  atteignent les services ([`validate.js`](../src/middlewares/validate.js)).
- **SSRF / path traversal** : pas de fetch d'URL utilisateur côté serveur ; clés
  d'upload contrôlées.
- **XSS** : sanitizer serveur ([`sanitize.js`](../src/utils/sanitize.js)) qui retire
  le HTML actif (`<script>`/`<style>` + tags) tout en préservant le texte,
  appliqué à l'écriture des **messages de chat** (4 chats), des **replays** et
  des **descriptions de sponsors** ; les contenus sont par ailleurs restitués en
  JSON (pas de rendu HTML serveur).

## 7. En-têtes & transport

- **Helmet** : CSP stricte en production, **HSTS**, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options` — [`app.js`](../src/app.js).
- **CORS** : whitelist via `CORS_ORIGINS`, `credentials` activé.
- **CSRF** : API à jeton Bearer (pas de session cookie) ⇒ CSRF non applicable ;
  à réintroduire si des endpoints cookie sont ajoutés.

## 8. Rate limiting

- Global : 300 req/min. Sensibles : **login 5/min/IP**, **OTP 3/10 min**
  ([`rateLimit.js`](../src/middlewares/rateLimit.js)). Store Redis en production,
  fallback in-process en dev.

## 9. Secrets & audit

- `dotenv-safe` bloque le boot si un secret manque ; **secrets jamais loggés**
  (logger Pino avec redaction). `.env` hors du dépôt.
- **Audit admin** : toute mutation privilégiée écrit dans `admin_logs`
  ([`adminLog.service.js`](../src/services/adminLog.service.js)).
- Corrélation des requêtes via `x-request-id`.

## 10. Checklist de durcissement (prod)

- [ ] `REDIS_OPTIONAL=false`, `NODE_ENV=production`.
- [ ] Clés RS256 réelles ; rotation planifiée.
- [ ] `CORS_ORIGINS` restreint aux domaines front/mobile.
- [ ] Secrets webhooks (CinetPay/Moneroo/Stripe) configurés ; URLs HTTPS.
- [ ] Bucket S3 privé + CDN pour le public ; expiration des URLs présignées.
- [ ] TLS terminé au LB, HSTS actif.
- [ ] Sauvegardes MySQL + rétention des tables d'audit/financières.
- [ ] Surveillance des `admin_logs`, des retraits `pending`, et des `webhook_events` en échec.

## 11. Signalement d'une vulnérabilité

Contact sécurité : `security@dualmusic.app` (à ajuster). Merci de ne pas divulguer
publiquement avant correctif.
