/* eslint-disable */
/**
 * sequelize-cli database configuration (CommonJS).
 *
 * Consumed exclusively by `sequelize-cli` for migrations, seeders and db:create.
 * The application runtime builds its own Sequelize instance in
 * `src/config/sequelize.js` (ES module) from the same environment variables,
 * guaranteeing a single source of truth for connection parameters.
 *
 * MySQL 8 is configured with utf8mb4 / utf8mb4_0900_ai_ci and a UTC session
 * timezone so that all timestamps are stored and compared in UTC, per spec.
 */
require('dotenv').config();

/** @type {import('sequelize').Options} */
const base = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'duel_music',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  timezone: '+00:00',
  dialectOptions: {
    charset: 'utf8mb4',
    dateStrings: false,
    // Ensures the connection session runs in UTC.
    timezone: 'Z',
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    underscored: true,
  },
  logging: false,
};

module.exports = {
  development: { ...base },
  test: {
    ...base,
    database: process.env.DB_NAME_TEST || `${base.database}_test`,
  },
  production: {
    ...base,
    logging: false,
    pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
  },
};
