import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_payout_methods`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserPayoutMethod(sequelize) {
  return sequelize.define(
    'UserPayoutMethod',
    {
    account_holder: { type: DataTypes.STRING, allowNull: true },
    bank_name: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    iban: { type: DataTypes.STRING, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    label: { type: DataTypes.STRING, allowNull: true },
    method: { type: DataTypes.STRING, allowNull: false },
    mobile_operator: { type: DataTypes.STRING, allowNull: true },
    paypal_email: { type: DataTypes.STRING, allowNull: true },
    phone_number: { type: DataTypes.STRING, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'user_payout_methods',
      timestamps: false,
      underscored: true,
    },
  );
}
