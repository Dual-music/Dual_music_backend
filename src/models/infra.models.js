import { DataTypes } from 'sequelize';

/**
 * @file Hand-authored infrastructure models (not part of the domain schema):
 *  - `idempotency_keys` — stores the response of a financial POST keyed by the
 *    client's `Idempotency-Key`, so retries replay the original result instead
 *    of double-charging.
 *  - `webhook_events` — a processed-once ledger for payment provider webhooks,
 *    giving replay protection independent of the settlement procedures.
 *
 * Shaped like the generated registry so `models/index.js` can spread it in.
 *
 * @module models/infra.models
 */

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export function defineIdempotencyKey(sequelize) {
  return sequelize.define(
    'IdempotencyKey',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
      idempotency_key: { type: DataTypes.STRING(255), allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: true },
      method: { type: DataTypes.STRING(10), allowNull: false },
      path: { type: DataTypes.STRING(255), allowNull: false },
      request_hash: { type: DataTypes.STRING(64), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'in_progress' },
      response_status: { type: DataTypes.INTEGER, allowNull: true },
      response_body: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      expires_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'idempotency_keys',
      timestamps: false,
      underscored: true,
      indexes: [{ unique: true, name: 'uq_idem_scope', fields: ['user_id', 'idempotency_key', 'path'] }],
    },
  );
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export function defineWebhookEvent(sequelize) {
  return sequelize.define(
    'WebhookEvent',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
      provider: { type: DataTypes.STRING(20), allowNull: false },
      external_id: { type: DataTypes.STRING(255), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'processing' },
      payload_hash: { type: DataTypes.STRING(64), allowNull: true },
      received_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      processed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'webhook_events',
      timestamps: false,
      underscored: true,
      indexes: [{ unique: true, name: 'uq_webhook_event', fields: ['provider', 'external_id'] }],
    },
  );
}

/**
 * Registry of hand-authored infrastructure models.
 * @type {Array<{ name: string, define: (sequelize: import('sequelize').Sequelize) => import('sequelize').ModelStatic<any> }>}
 */
export const infraModels = [
  { name: 'IdempotencyKey', define: defineIdempotencyKey },
  { name: 'WebhookEvent', define: defineWebhookEvent },
];

export default infraModels;
