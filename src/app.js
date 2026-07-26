import 'express-async-errors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { language } from './middlewares/language.js';
import { globalLimiter } from './middlewares/rateLimit.js';
import { requestId } from './middlewares/requestId.js';
import { docsRouter } from './openapi/docs.routes.js';
import { apiRouter } from './routes/index.js';
import { mediaRouter } from './routes/media.routes.js';

/**
 * @file Express application factory.
 *
 * Assembles the HTTP middleware pipeline in a security-first order:
 * correlation-id → structured logging → security headers → CORS whitelist →
 * body parsing (with raw-body capture for signed webhooks) → global rate limit →
 * API routes → 404 → centralized error handler.
 *
 * @module app
 */

/**
 * Captures the raw request body (needed to verify webhook HMAC signatures)
 * without preventing normal JSON parsing.
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {Buffer} buf
 */
function captureRawBody(req, _res, buf) {
  if (buf?.length) req.rawBody = Buffer.from(buf);
}

/**
 * Builds and returns the configured Express app.
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: config.isProd ? undefined : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin/non-browser (no Origin) and whitelisted origins.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(language());
  app.use(globalLimiter);

  // API docs: OpenAPI spec + self-contained Swagger explorer (before the API
  // router so `/docs` and `/api/v1/openapi.json` resolve without auth).
  app.use(docsRouter);

  // Public media served from local disk (only active under STORAGE_DRIVER=local).
  // Mounted at the app root so `publicUrl()` links stay outside the API prefix.
  app.use('/media', mediaRouter);

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler());
  app.use(errorHandler);

  return app;
}

export default createApp;
