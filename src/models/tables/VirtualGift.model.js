import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `virtual_gifts`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineVirtualGift(sequelize) {
  return sequelize.define(
    'VirtualGift',
    {
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    image_url: { type: DataTypes.STRING(2048), allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    },
    {
      tableName: 'virtual_gifts',
      timestamps: false,
      underscored: true,
    },
  );
}
