import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `exchange_rates`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineExchangeRate(sequelize) {
  return sequelize.define(
    'ExchangeRate',
    {
    currency_code: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: true },
    rate_per_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    symbol: { type: DataTypes.STRING, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'exchange_rates',
      timestamps: false,
      underscored: true,
    },
  );
}
