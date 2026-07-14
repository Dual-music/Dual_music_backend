import { config } from '../config/env.js';
import { adminRouter } from '../routes/admin.routes.js';
import { authRouter } from '../routes/auth.routes.js';
import { competitionRouter } from '../routes/competition.routes.js';
import { artistConcertRouter, concertRouter } from '../routes/concert.routes.js';
import { artistRouter, managerRouter } from '../routes/creator.routes.js';
import { duelRouter } from '../routes/duel.routes.js';
import { giftRouter } from '../routes/gift.routes.js';
import { leaderboardRouter } from '../routes/leaderboard.routes.js';
import { liveRouter } from '../routes/live.routes.js';
import { livekitRouter } from '../routes/livekit.routes.js';
import { moderationRouter } from '../routes/moderation.routes.js';
import { notificationRouter } from '../routes/notification.routes.js';
import { paymentsRouter } from '../routes/payments.routes.js';
import { referralRouter } from '../routes/referral.routes.js';
import { replayRouter } from '../routes/replay.routes.js';
import { sponsorRouter } from '../routes/sponsor.routes.js';
import { subscriptionRouter } from '../routes/subscription.routes.js';
import { uploadRouter } from '../routes/upload.routes.js';
import { userRouter } from '../routes/user.routes.js';
import { walletRouter } from '../routes/wallet.routes.js';
import { withdrawalRouter } from '../routes/withdrawal.routes.js';

import { joiToParameters, joiToSchema } from './joiToSchema.js';

/**
 * @file OpenAPI 3.1 document builder.
 *
 * Generates the API spec by introspecting each feature router's Express stack:
 * paths + methods come from the route layers, while auth/role requirements and
 * request schemas are read from the metadata that `authenticate`,
 * `requireRole`, and `validate` attach to their middlewares (`__auth`,
 * `__roles`, `__schemas`). This keeps the spec in lock-step with the real
 * routes — a new endpoint is documented the moment it is mounted.
 *
 * @module openapi/build
 */

/** Mounts mirror `routes/index.js` — [prefix, router, tag]. */
const MOUNTS = [
  ['/auth', authRouter, 'Auth'],
  ['/users', userRouter, 'Users'],
  ['/artists', artistRouter, 'Creators'],
  ['/managers', managerRouter, 'Creators'],
  ['/wallet', walletRouter, 'Wallet'],
  ['/payments', paymentsRouter, 'Payments'],
  ['/gifts', giftRouter, 'Gifts'],
  ['/duels', duelRouter, 'Duels'],
  ['/lives', liveRouter, 'Lives'],
  ['/concerts', concertRouter, 'Concerts'],
  ['/artist-concerts', artistConcertRouter, 'Concerts'],
  ['/competitions', competitionRouter, 'Competitions'],
  ['/livekit', livekitRouter, 'LiveKit'],
  ['/moderation', moderationRouter, 'Moderation'],
  ['/notifications', notificationRouter, 'Notifications'],
  ['/leaderboards', leaderboardRouter, 'Leaderboards'],
  ['/sponsors', sponsorRouter, 'Sponsors'],
  ['/replays', replayRouter, 'Replays'],
  ['/uploads', uploadRouter, 'Uploads'],
  ['/withdrawals', withdrawalRouter, 'Withdrawals'],
  ['/subscriptions', subscriptionRouter, 'Subscriptions'],
  ['/referrals', referralRouter, 'Referrals'],
  ['/admin', adminRouter, 'Admin'],
];

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** Converts an Express path (`/:id`) to an OpenAPI path (`/{id}`). */
function toOpenApiPath(prefix, routePath) {
  const full = `${prefix}${routePath}`.replace(/\/+/g, '/');
  return full.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '') || '/';
}

/**
 * Collects router-level middleware defaults (`router.use(authenticate())`,
 * etc.) that apply to every route on the router.
 * @param {any[]} stack
 * @returns {{ auth: string|null, roles: string[] }}
 */
function routerDefaults(stack) {
  const def = { auth: null, roles: [] };
  for (const layer of stack) {
    if (layer.route) continue;
    const h = layer.handle;
    if (h?.__auth) def.auth = h.__auth;
    if (h?.__roles) def.roles = h.__roles;
  }
  return def;
}

/**
 * Aggregates auth/role/schema metadata from a route's middleware stack, seeded
 * with the router-level defaults.
 * @param {any[]} routeStack
 * @param {{ auth: string|null, roles: string[] }} defaults
 */
function routeMeta(routeStack, defaults) {
  const meta = { auth: defaults.auth, roles: [...defaults.roles], schemas: {}, idempotent: false };
  for (const layer of routeStack) {
    const h = layer.handle;
    if (!h) continue;
    if (h.__auth) meta.auth = h.__auth;
    if (h.__roles) meta.roles = h.__roles;
    if (h.__schemas) meta.schemas = h.__schemas;
    if (h.__idempotent) meta.idempotent = true;
  }
  return meta;
}

/** Standard success/error responses referencing the uniform envelopes. */
function standardResponses(hasBodyCreate) {
  return {
    [hasBodyCreate ? '201' : '200']: {
      description: 'Success',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
    },
    400: { description: 'Validation / business error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
    401: { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  };
}

/**
 * Builds the full OpenAPI 3.1 document.
 * @returns {object}
 */
export function buildOpenApiDocument() {
  const paths = {};
  const tags = new Set();

  for (const [prefix, router, tag] of MOUNTS) {
    tags.add(tag);
    const stack = router?.stack ?? [];
    const defaults = routerDefaults(stack);
    for (const layer of stack) {
      if (!layer.route) continue;
      const openapiPath = toOpenApiPath(prefix, layer.route.path);
      const meta = routeMeta(layer.route.stack, defaults);

      for (const method of Object.keys(layer.route.methods)) {
        if (!HTTP_METHODS.has(method)) continue;

        const operation = {
          tags: [tag],
          operationId: `${method}_${openapiPath}`.replace(/[/{}]/g, '_').replace(/_+/g, '_'),
          summary: `${method.toUpperCase()} ${openapiPath}`,
          parameters: [
            ...joiToParameters(meta.schemas.params, 'path'),
            ...joiToParameters(meta.schemas.query, 'query'),
            ...(meta.idempotent
              ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' }, description: 'Unique key to make this financial POST safe to retry.' }]
              : []),
          ],
          responses: standardResponses(method === 'post'),
        };

        if (meta.roles.length) {
          operation.description = `Requires role: ${meta.roles.join(' | ')}.`;
        }
        if (meta.auth) {
          operation.security = [{ bearerAuth: [] }];
          if (meta.auth === 'optional') {
            operation.description = `${operation.description ?? ''} Authentication optional (enriched when present).`.trim();
          }
        }
        if (meta.schemas.body && ['post', 'put', 'patch'].includes(method)) {
          operation.requestBody = {
            required: true,
            content: { 'application/json': { schema: joiToSchema(meta.schemas.body) } },
          };
        }
        if (!operation.parameters.length) delete operation.parameters;

        paths[openapiPath] = paths[openapiPath] || {};
        paths[openapiPath][method] = operation;
      }
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Dual Music API',
      version: '1.0.0',
      description:
        'REST API for the Dual Music social music-streaming platform (duels, concerts, lives, competitions, ' +
        'virtual economy, payments, moderation, leaderboards). All responses use the uniform ' +
        '`{ data, meta }` / `{ error }` envelopes.',
    },
    servers: [{ url: `${config.apiBaseUrl?.replace(/\/$/, '') || ''}/api/v1`, description: 'API v1' }],
    tags: [...tags].map((name) => ({ name })),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: {
            data: {},
            meta: {
              type: 'object',
              properties: {
                requestId: { type: 'string' },
                pagination: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'WALLET_INSUFFICIENT' },
                message: { type: 'string' },
                details: { type: 'object', additionalProperties: true },
              },
              required: ['code', 'message'],
            },
            meta: { type: 'object', properties: { requestId: { type: 'string' } } },
          },
        },
      },
    },
    paths,
  };
}

export default buildOpenApiDocument;
