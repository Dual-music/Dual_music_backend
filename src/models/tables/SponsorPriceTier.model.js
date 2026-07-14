import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `sponsor_price_tiers`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineSponsorPriceTier(sequelize) {
  return sequelize.define(
    'SponsorPriceTier',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    label: { type: DataTypes.STRING, allowNull: false },
    max_seconds: { type: DataTypes.INTEGER, allowNull: false },
    min_seconds: { type: DataTypes.INTEGER, allowNull: false },
    price_credits: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'sponsor_price_tiers',
      timestamps: false,
      underscored: true,
    },
  );
}
