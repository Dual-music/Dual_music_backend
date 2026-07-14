import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `content_shares`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineContentShare(sequelize) {
  return sequelize.define(
    'ContentShare',
    {
    content_id: { type: DataTypes.UUID, allowNull: false },
    content_type: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    platform: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'content_shares',
      timestamps: false,
      underscored: true,
    },
  );
}
