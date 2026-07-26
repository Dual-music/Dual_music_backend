# Media storage

Uploaded media (avatars, images, videos, sponsor media, premium replays) is
handled by a **pluggable storage driver**. The active driver is chosen once, at
deploy time, via the `STORAGE_DRIVER` environment variable.

```
STORAGE_DRIVER=s3      # Cloudflare R2 / AWS S3  (recommended for production)
STORAGE_DRIVER=local   # backend local disk       (dev / self-hosted only)
```

The upload **policy** (per-category MIME allowlist + size caps, server-generated
keys, magic-byte re-validation, optional ClamAV scan) is identical for both
drivers — see [`src/services/upload.service.js`](../src/services/upload.service.js).
Only the **transport** (where bytes live, how URLs are signed) differs.

## Upload flow (identical for the client)

1. `POST /uploads/presign` → `{ uploadUrl, key, publicUrl }`
2. `PUT <uploadUrl>` with the raw bytes + `Content-Type`
3. `POST /uploads/confirm { key }` → validated `{ publicUrl }`

The web/mobile clients never know which driver is active — `uploadUrl` is either
a presigned R2 URL or a token-signed local URL.

## Drivers

### `s3` — Cloudflare R2 / AWS S3

- Direct-to-storage presigned `PUT` (offloads bandwidth from the API).
- Public objects served from `S3_PUBLIC_BASE_URL` (R2 public URL or custom domain).
- Private objects (replays) served via short-lived presigned `GET`.
- Config: `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`. `forcePathStyle` is enabled for
  R2/MinIO compatibility.

### `local` — backend disk

- Bytes are streamed to `LOCAL_STORAGE_DIR` (default `storage/uploads`).
- "Presigned" URLs point back to our own **token-authorized** routes
  (`/api/v1/uploads/local/<token>`, HMAC-signed key + op + expiry).
- Public objects served from `GET /media/<key>`; private categories are refused
  there and only reachable via the token-signed download route.
- Public base URL: `LOCAL_PUBLIC_BASE_URL` (falls back to `API_BASE_URL/media`).

> ⚠️ Local disk is **ephemeral** on most PaaS hosts (Render, Railway, Fly,
> containers) — uploaded files vanish on every redeploy — and does not scale
> horizontally. Use `s3` in production.

## Why the choice is not a runtime admin toggle

The admin console (Platform config) shows the active driver **read-only**. The
storage backend is deliberately *not* switchable at runtime because:

1. **Existing media would orphan.** Public URLs are persisted on resources at
   upload time. Flipping the driver would leave every previously stored URL
   pointing at the old backend unless every object is migrated.
2. It is an infrastructure decision, not a per-request user setting.

To switch, migrate the objects, change `STORAGE_DRIVER`, and redeploy.
