import pino from 'pino';

import { config } from './env.js';

/**
 * @file Application logger (Pino).
 *
 * Structured JSON logging in production; pretty output in development when
 * `pino-pretty` is available. Never logs secrets — request/response middleware
 * is responsible for redacting sensitive fields.
 *
 * @module config/logger
 */

const isDev = config.env === 'development';

/** @type {import('pino').Logger} */
export const logger = pino({
  level: config.logLevel,
  base: { service: 'duel-music-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.refresh_token',
      '*.pin',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

export default logger;
