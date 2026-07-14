import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_currency_preferences`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserCurrencyPreference(sequelize) {
  return sequelize.define(
    'UserCurrencyPreference',
    {
    currency_code: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    },
    {
      tableName: 'user_currency_preferences',
      timestamps: false,
      underscored: true,
    },
  );
}
