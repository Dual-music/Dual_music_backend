import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `subscription_plans`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineSubscriptionPlan(sequelize) {
  return sequelize.define(
    'SubscriptionPlan',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    currency: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    features: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    gradient: { type: DataTypes.STRING, allowNull: false },
    icon: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    name: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    rules: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'subscription_plans',
      timestamps: false,
      underscored: true,
    },
  );
}
