import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `withdrawal_pin_reset_tokens`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineWithdrawalPinResetToken(sequelize) {
  return sequelize.define(
    'WithdrawalPinResetToken',
    {
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    otp_hash: { type: DataTypes.STRING, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'withdrawal_pin_reset_tokens',
      timestamps: false,
      underscored: true,
    },
  );
}
