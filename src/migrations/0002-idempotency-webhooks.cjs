/* eslint-disable */
'use strict';

/**
 * Migration 0002 — infrastructure tables for financial safety:
 *  - `idempotency_keys`: replay store for `Idempotency-Key` on financial POSTs.
 *  - `webhook_events`: processed-once ledger for provider webhooks.
 *
 * Reversible: `down` drops both tables.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const opts = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' };

    await queryInterface.createTable(
      'idempotency_keys',
      {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        idempotency_key: { type: Sequelize.STRING(255), allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: true },
        method: { type: Sequelize.STRING(10), allowNull: false },
        path: { type: Sequelize.STRING(255), allowNull: false },
        request_hash: { type: Sequelize.STRING(64), allowNull: false },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'in_progress' },
        response_status: { type: Sequelize.INTEGER, allowNull: true },
        response_body: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        expires_at: { type: Sequelize.DATE, allowNull: true },
      },
      opts,
    );
    await queryInterface.addIndex('idempotency_keys', ['user_id', 'idempotency_key', 'path'], {
      unique: true,
      name: 'uq_idem_scope',
    });

    await queryInterface.createTable(
      'webhook_events',
      {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        provider: { type: Sequelize.STRING(20), allowNull: false },
        external_id: { type: Sequelize.STRING(255), allowNull: false },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'processing' },
        payload_hash: { type: Sequelize.STRING(64), allowNull: true },
        received_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        processed_at: { type: Sequelize.DATE, allowNull: true },
      },
      opts,
    );
    await queryInterface.addIndex('webhook_events', ['provider', 'external_id'], {
      unique: true,
      name: 'uq_webhook_event',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('idempotency_keys');
    await queryInterface.dropTable('webhook_events');
  },
};
