import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `credit_purchases`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCreditPurchase(sequelize) {
  return sequelize.define(
    'CreditPurchase',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    credits_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    paid_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    payment_method: { type: DataTypes.STRING, allowNull: false },
    payment_reference: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'credit_purchases',
      timestamps: false,
      underscored: true,
    },
  );
}
