import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `cinetpay_transactions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCinetpayTransaction(sequelize) {
  return sequelize.define(
    'CinetpayTransaction',
    {
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    cinetpay_transaction_id: { type: DataTypes.STRING, allowNull: true },
    country_code: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    credits_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    currency: { type: DataTypes.STRING, allowNull: false },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    merchant_transaction_id: { type: DataTypes.STRING, allowNull: false },
    notify_token: { type: DataTypes.STRING, allowNull: false },
    payment_method: { type: DataTypes.STRING, allowNull: false },
    phone_number: { type: DataTypes.STRING, allowNull: false },
    processed_at: { type: DataTypes.DATE, allowNull: true },
    raw_init_response: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    raw_verify_response: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    raw_webhook_payload: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    status: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, allowNull: false },
    withdrawal_request_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'cinetpay_transactions',
      timestamps: false,
      underscored: true,
    },
  );
}
