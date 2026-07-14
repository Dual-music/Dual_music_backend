import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `gift_conversions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineGiftConversion(sequelize) {
  return sequelize.define(
    'GiftConversion',
    {
    cash_value: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    gift_value: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'gift_conversions',
      timestamps: false,
      underscored: true,
    },
  );
}
