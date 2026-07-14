import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `cinetpay_countries`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCinetpayCountry(sequelize) {
  return sequelize.define(
    'CinetpayCountry',
    {
    country_code: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    country_name: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    currency: { type: DataTypes.STRING, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    operators: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    phone_prefix: { type: DataTypes.STRING, allowNull: false },
    secret_key_name: { type: DataTypes.STRING, allowNull: false },
    secret_password_name: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'cinetpay_countries',
      timestamps: false,
      underscored: true,
    },
  );
}
