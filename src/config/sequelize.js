import { Sequelize } from 'sequelize';

import { config } from './env.js';
import { logger } from './logger.js';

/**
 * @file Application Sequelize instance (ES module).
 *
 * Single shared connection pool used by every model and repository at runtime.
 * Mirrors the parameters of `src/config/config.cjs` (used by sequelize-cli) so
 * the app and the migration tooling always target the same database with the
 * same charset/collation/timezone guarantees (utf8mb4 / UTC).
 *
 * @module config/sequelize
 */

const isSqlite = config.db.dialect === 'sqlite';

/**
 * Runtime Sequelize instance. MySQL in dev/prod; SQLite (in-memory) is supported
 * for fast, infra-free integration tests of pure-ORM modules (e.g. auth).
 * @type {import('sequelize').Sequelize}
 */
export const sequelize = isSqlite
  ? new Sequelize({
      dialect: 'sqlite',
      storage: config.db.storage,
      define: { underscored: true },
      logging: false,
    })
  : new Sequelize(config.db.name, config.db.user, config.db.password, {
      host: config.db.host,
      port: config.db.port,
      dialect: 'mysql',
      timezone: '+00:00',
      dialectOptions: { charset: 'utf8mb4', timezone: 'Z', decimalNumbers: true },
      define: { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', underscored: true },
      pool: { max: config.isProd ? 20 : 10, min: 2, acquire: 30000, idle: 10000 },
      logging: config.env === 'development' ? (msg) => logger.debug(msg) : false,
    });

/**
 * Verifies database connectivity. Throws on failure so the caller can decide
 * whether to abort startup.
 * @returns {Promise<void>}
 */
export async function assertDatabaseConnection() {
  await sequelize.authenticate();
  logger.info({ db: config.db.name, host: config.db.host }, 'Database connection established');
}

export default sequelize;
