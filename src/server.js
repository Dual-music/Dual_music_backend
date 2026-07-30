import http from 'node:http';

import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { assertDatabaseConnection, sequelize } from './config/sequelize.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { attachRealtime } from './realtime/index.js';

/**
 * @file HTTP server bootstrap & lifecycle.
 *
 * Verifies the database connection, starts the HTTP server, and wires graceful
 * shutdown (SIGINT/SIGTERM) to drain connections and close the DB pool. The
 * Socket.IO realtime layer is attached to this same server in a later module.
 *
 * @module server
 */

async function bootstrap() {
  await assertDatabaseConnection();

  const app = createApp();
  const server = http.createServer(app);

  // Realtime (Socket.IO) shares the HTTP server: /chat, /live, /notifications.
  attachRealtime(server);

  // Background jobs (BullMQ + Redis, or in-process cron fallback).
  await startJobs();

  // Bind explicite sur 0.0.0.0 : accepte les connexions IPv4 de tout le LAN
  // (indispensable pour qu'un téléphone en WiFi atteigne le PC via son IP locale).
  const host = process.env.HOST || '0.0.0.0';
  server.listen(config.port, host, () => {
    logger.info(`Dual Music API listening on http://${host}:${config.port} (${config.env})`);
  });

  /** @param {NodeJS.Signals} signal */
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async () => {
      try {
        await stopJobs();
        await sequelize.close();
      } finally {
        process.exit(0);
      }
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal boot error');
  process.exit(1);
});
