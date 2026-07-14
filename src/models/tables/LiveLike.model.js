import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `live_likes`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLiveLike(sequelize) {
  return sequelize.define(
    'LiveLike',
    {
    likes_count: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    live_id: { type: DataTypes.UUID, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'live_likes',
      timestamps: false,
      underscored: true,
    },
  );
}
