import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `blogs`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineBlog(sequelize) {
  return sequelize.define(
    'Blog',
    {
    author_id: { type: DataTypes.UUID, allowNull: false },
    author_name: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false, defaultValue: 'news' },
    content: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    excerpt: { type: DataTypes.TEXT, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    image_url: { type: DataTypes.STRING(2048), allowNull: true },
    published: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    title: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    views_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'blogs',
      timestamps: true,
      createdAt: false,
      updatedAt: false,
      deletedAt: 'deleted_at',
      paranoid: true,
      underscored: true,
    },
  );
}
