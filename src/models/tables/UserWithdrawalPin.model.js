import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_withdrawal_pins`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserWithdrawalPin(sequelize) {
  return sequelize.define(
    'UserWithdrawalPin',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    failed_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE, allowNull: true },
    pin_hash: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    },
    {
      tableName: 'user_withdrawal_pins',
      timestamps: false,
      underscored: true,
    },
  );
}
