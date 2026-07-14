import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `comments`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineComment(sequelize) {
  return sequelize.define(
    'Comment',
    {
    content: { type: DataTypes.TEXT, allowNull: false },
    content_id: { type: DataTypes.UUID, allowNull: false },
    content_type: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    likes_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    parent_id: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'comments',
      timestamps: true,
      createdAt: false,
      updatedAt: false,
      deletedAt: 'deleted_at',
      paranoid: true,
      underscored: true,
    },
  );
}
