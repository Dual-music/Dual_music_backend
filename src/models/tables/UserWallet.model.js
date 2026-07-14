import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_wallets`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserWallet(sequelize) {
  return sequelize.define(
    'UserWallet',
    {
    balance: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    },
    {
      tableName: 'user_wallets',
      timestamps: false,
      underscored: true,
    },
  );
}
