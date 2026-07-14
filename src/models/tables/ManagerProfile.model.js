import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `manager_profiles`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineManagerProfile(sequelize) {
  return sequelize.define(
    'ManagerProfile',
    {
    avatar_url: { type: DataTypes.STRING(2048), allowNull: true },
    bio: { type: DataTypes.TEXT, allowNull: true },
    commission_rate: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 10 },
    cover_image_url: { type: DataTypes.STRING(2048), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    display_name: { type: DataTypes.STRING, allowNull: true },
    experience: { type: DataTypes.TEXT, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_public: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    social_links: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'manager_profiles',
      timestamps: false,
      underscored: true,
    },
  );
}
