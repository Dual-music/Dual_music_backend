import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `withdrawal_requests`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineWithdrawalRequest(sequelize) {
  return sequelize.define(
    'WithdrawalRequest',
    {
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    auto_processed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    payment_details: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    payment_method: { type: DataTypes.STRING, allowNull: true },
    processed_at: { type: DataTypes.DATE, allowNull: true },
    processed_by: { type: DataTypes.UUID, allowNull: true },
    provider: { type: DataTypes.STRING, allowNull: true },
    provider_tx_id: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'withdrawal_requests',
      timestamps: false,
      underscored: true,
    },
  );
}
