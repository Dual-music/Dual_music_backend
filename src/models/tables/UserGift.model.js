import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_gifts`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserGift(sequelize) {
  return sequelize.define(
    'UserGift',
    {
    gift_id: { type: DataTypes.UUID, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    purchased_at: { type: DataTypes.DATE, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'user_gifts',
      timestamps: false,
      underscored: true,
    },
  );
}
