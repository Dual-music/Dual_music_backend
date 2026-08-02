# Enregistrement des directs → Replays (LiveKit Egress)

Enregistrement **serveur** des directs pour générer les replays, via **LiveKit Egress**.
Fonctionne à l'identique que l'hôte diffuse depuis le **web ou le mobile** : c'est la _room_
qui est enregistrée côté serveur, pas l'onglet du navigateur.

## Pourquoi côté serveur (et pas MediaRecorder navigateur)

L'ancienne approche web (`MediaRecorder` + bouton manuel) enregistrait uniquement le flux
local de l'hôte, dépendait de son onglet resté ouvert, ne produisait pas de miniature, et
**ne couvrait pas les hôtes mobiles**. L'egress serveur corrige tout ça : automatique,
composite (tous les intervenants), robuste aux déconnexions, uniforme web/mobile.

## Flux

1. **Go-live** (`live`, `duel`, `concert`) → le service appelle `startRecording()`
   ([recording.service.js](../src/services/recording.service.js)) qui lance un
   `RoomCompositeEgress` LiveKit écrivant un MP4 vers R2/S3 sur une clé déterministe
   (`replays/<type>/<id>/<ts>.mp4`). Une ligne `stream_recordings` corrèle l'egress à l'événement.
2. **Fin du direct** → `stopRecording()` arrête l'egress.
3. **Webhook** `POST /webhooks/livekit` (event `egress_ended`, statut COMPLETE) →
   `finalizeFromEgress()` crée le `replay_videos` (URL publique déduite de la clé, durée,
   miniature) et clôt la ligne `stream_recordings`.

**Miniatures** : un `ImageOutput` (frame extraite de la vidéo toutes les 30 s, écrasée sur une
clé unique) fournit une vraie vignette. Repli sur la couverture de l'événement si LiveKit
n'a pas produit d'image.

**Fiabilité** : un job `reconcile-recordings` (toutes les 5 min) rattrape les webhooks perdus
(crash hôte, redémarrage) en interrogeant l'egress réel (`listEgress`) pour finaliser/clôturer,
et échoue les `pending` bloqués. No-op si egress off.

Tout est **gated** : si `LIVEKIT_EGRESS_ENABLED=false` ou storage/LiveKit non configuré,
chaque point est un **no-op** — un échec d'enregistrement ne casse jamais un passage en live.

> **Compétitions** : volontairement hors auto-egress pour l'instant (cycle par slots/votes,
> potentiellement multi-jours → un egress continu n'aurait pas de sens). À cadrer séparément
> (egress par slot de performeur) si besoin.

## Prérequis d'infra (à provisionner)

1. **Service LiveKit Egress** déployé et connecté au serveur LiveKit + Redis.
   Cloud LiveKit : l'egress est fourni. Self-hosted : déployer le conteneur
   `livekit/egress` (voir docs LiveKit « Egress »).
2. **Creds S3/R2** (déjà utilisés pour les uploads média) : `S3_ENDPOINT`, `S3_REGION`,
   `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`.
   L'egress écrit directement dans ce bucket ; `S3_PUBLIC_BASE_URL` doit servir ce bucket
   en lecture publique.
3. **Webhook LiveKit** : configurer l'URL `https://<api>/webhooks/livekit` dans la config
   LiveKit (`webhook.urls`). La signature est vérifiée avec `LIVEKIT_API_KEY/SECRET`.
4. **Activer** : `LIVEKIT_EGRESS_ENABLED=true`.
5. **Migration** : `npm run db:migrate` (crée `stream_recordings`).

## Vérification

- Passer un live/duel/concert en live → une ligne `stream_recordings` (status `active`,
  `egress_id` renseigné) apparaît.
- Terminer le direct → après quelques secondes, l'egress se termine, le webhook arrive,
  un `replay_videos` est créé et `stream_recordings.status = completed`.
- Le replay apparaît alors dans la liste des replays (web et mobile).

## Améliorations possibles (phase 2)

- **Egress compétition** par slot de performeur (aujourd'hui hors scope).
- **Feed replays** vertical façon TikTok + accès depuis les cartes d'événements terminés.
