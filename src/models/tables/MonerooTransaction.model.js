import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `moneroo_transactions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineMonerooTransaction(sequelize) {
  return sequelize.define(
    'MonerooTransaction',
    {
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    credits_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    currency: { type: DataTypes.STRING, allowNull: false },
    debug_logs: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    http_status: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    http_status_text: { type: DataTypes.STRING, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    merchant_transaction_id: { type: DataTypes.STRING, allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    moneroo_transaction_id: { type: DataTypes.STRING, allowNull: true },
    payment_method: { type: DataTypes.STRING, allowNull: true },
    phone_number: { type: DataTypes.STRING, allowNull: true },
    processed_at: { type: DataTypes.DATE, allowNull: true },
    raw_init_response: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    raw_verify_response: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    raw_webhook_payload: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    request_headers: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    request_payload: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    request_sent_at: { type: DataTypes.DATE, allowNull: true },
    request_url: { type: DataTypes.STRING(2048), allowNull: true },
    response_received_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'moneroo_transactions',
      timestamps: false,
      underscored: true,
    },
  );
}
