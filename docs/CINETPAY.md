# CinetPay — encaissement (PayIn) et versement (Transfert)

Intégration de l'**API v1 du nouveau backoffice** CinetPay (OAuth `api_key` /
`api_password`), pour les recharges de crédits et le versement des retraits en
Mobile Money.

> Ce n'est pas l'ancienne API `api-checkout.cinetpay.com/v2` (`apikey` + `site_id`
> dans le corps). Endpoints, authentification, noms de champs et codes diffèrent.

## Cartographie

| Élément | Fichier |
|---|---|
| Client HTTP (auth, PayIn, transfert, soldes) | [`providers/cinetpay.client.js`](../src/services/payments/providers/cinetpay.client.js) |
| Encaissement (init + webhook) | [`payments.service.js`](../src/services/payments/payments.service.js) |
| Versement (init, webhook, réconciliation, soldes) | [`payout.service.js`](../src/services/payments/payout.service.js) |
| Conversion crédits ↔ devise | [`pricing.service.js`](../src/services/payments/pricing.service.js) |
| Procédures atomiques encaissement | [`procedures/credits.sql`](../src/procedures/credits.sql) |
| Procédures atomiques versement | [`procedures/payouts.sql`](../src/procedures/payouts.sql) |
| Jobs de réconciliation + supervision | [`jobs/handlers.js`](../src/jobs/handlers.js) |

## Endpoints

| Méthode | Chemin | Accès |
|---|---|---|
| `POST` | `/api/v1/payments/cinetpay/init` | Bearer — renvoie l'URL de paiement |
| `GET` | `/api/v1/payments/cinetpay/countries` | public — catalogue pays/opérateurs |
| `POST` | `/api/v1/payments/cinetpay/webhook` | public — notification d'encaissement |
| `POST` | `/api/v1/payments/cinetpay/payout/webhook` | public — notification de transfert |
| `GET` | `/api/v1/payments/cinetpay/verify?merchantId=&settle=` | admin — diagnostic + règlement manuel |
| `GET` | `/api/v1/payments/cinetpay/balances` | admin — soldes marchands |
| `POST` | `/api/v1/withdrawals/:id/payout` | admin, ou propriétaire si `auto_processed` |

## Machine à états du versement

```
withdrawal_requests   pending|approved ──payout──► processing ──┬──► completed
                                                                └──► failed (crédits rendus)
cinetpay_transactions             pending ─────────────────────┬──► success
      (kind = payout)                                          └──► failed
```

`processing` est l'état pivot. Il rend impossible un double envoi (deux admins,
double-clic, rejeu de job) et sépare « ordre émis » de « argent versé ». **Seul le
webhook — ou la réconciliation, qui applique la même logique — écrit l'état final.**

## Les quatre invariants à ne pas casser

1. **Le corps du webhook ne fait jamais autorité.** Il identifie la transaction et
   prouve son origine via `notify_token` (comparaison en temps constant). Le statut
   vient toujours d'un `GET /v1/payment/{id}` ou `/v1/transfer/{id}`.
2. **Les fonds sont réservés à la demande, pas au versement.** `reserve_withdrawal`
   débite le portefeuille quand l'utilisateur crée sa demande. Le module de versement
   ne débite jamais — il rembourse (`cinetpay_revert_payout`).
3. **La vérification de transfert est tri-état.** Versé / rejeté / *en cours*. Traiter
   « en cours » comme un échec rembourse un transfert qui peut encore aboutir : double
   paiement silencieux.
4. **Tout mouvement de solde passe par une procédure stockée verrouillée** et
   idempotente. Aucun calcul de solde en applicatif.

## Configuration

```bash
CINETPAY_API_KEY=sk_test_…            # sk_live_… → bascule automatique sur api.cinetpay.co
CINETPAY_API_PASSWORD=…
CINETPAY_ACCOUNTS={"CI":{"key":"…","password":"…"}}   # 1 compte = 1 pays
CINETPAY_NOTIFY_URL=https://api.example.com/api/v1/payments/cinetpay/webhook
CINETPAY_PAYOUT_NOTIFY_URL=https://api.example.com/api/v1/payments/cinetpay/payout/webhook
CINETPAY_RETURN_URL=https://app.example.com/wallet
CINETPAY_BALANCE_ALERT_THRESHOLD=100000               # 0 = surveillance désactivée
```

Le catalogue pays vit en base (`cinetpay_countries`) : devise, préfixe téléphonique,
**liste blanche d'opérateurs** et *noms* des secrets. Ajouter un pays = un `INSERT`
plus les identifiants dans `CINETPAY_ACCOUNTS` — aucun déploiement de code.

### Liste blanche d'IP

CinetPay filtre par IP sortante et **n'accepte pas de plages CIDR**. L'IP publique du
backend doit être autorisée dans le compte marchand. En cas de rejet, l'erreur remonte
l'IP détectée dans `details.egressIp` — c'est celle à coller dans le backoffice.
CinetPay renvoyant parfois un **404 au corps vide** à une IP non autorisée, ce cas est
classé en rejet d'IP probable, sans quoi le diagnostic est impossible.

Si l'hébergement n'a pas d'IP sortante stable, passer par le proxy à IP fixe
(`duel_music_frontend/cinetpay-proxy/`).

## Tâches planifiées

| Job | Fréquence | Rôle |
|---|---|---|
| `retry-webhooks` | 3 min | Rattrape les encaissements dont la notification s'est perdue (2 min → 24 h) |
| `reconcile-payouts` | 5 min | Idem pour les transferts (3 min → 7 j), même logique que le webhook |
| `monitor-cinetpay-balances` | 2 h | Alerte `cinetpay_alerts` sous le seuil de solde |

La réconciliation n'est pas une sécurité optionnelle : les webhooks se perdent. Une
hausse du nombre de transactions rattrapées signale une rupture du canal de notification.

## Exploitation

**Une transaction reste bloquée.**
`GET /payments/cinetpay/verify?merchantId=…` observe sans rien écrire. Ajouter
`&settle=true` applique le statut constaté via les mêmes procédures que le webhook.
C'est l'outil de support de première ligne, pour un encaissement comme pour un transfert.

**Les transferts d'un pays échouent tous.** Vérifier
`GET /payments/cinetpay/balances` : un compte marchand à sec fait échouer chaque ordre
sans autre signal. Consulter aussi `cinetpay_alerts`.

**Alerte `payout_revert_conflict` (sévérité `critical`).** Le système a tenté de
rembourser un transfert que CinetPay déclare versé. La procédure a refusé — c'est
volontaire : rembourser aurait rendu les crédits *et* payé. Traitement manuel requis.

**Colonnes d'audit.** `raw_init_response`, `raw_verify_response` et
`raw_webhook_payload` conservent les échanges bruts. C'est ce qui permet de trancher un
litige six mois plus tard : ne pas les purger pour « alléger ».

## Tests

```bash
npm test -- tests/payout.test.js tests/payments.test.js
```

`payout.test.js` couvre les invariants financiers : validation de la cible, ordre
réservation-avant-appel, remboursement sur refus HTTP *et* sur exception réseau, refus
d'une notification forgée, et surtout le cas « transfert en cours » qui ne doit produire
**aucune** écriture comptable.
