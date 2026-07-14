import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `artist_profiles`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineArtistProfile(sequelize) {
  return sequelize.define(
    'ArtistProfile',
    {
    available_balance: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    avatar_url: { type: DataTypes.STRING(2048), allowNull: true },
    bio: { type: DataTypes.TEXT, allowNull: true },
    cover_image_url: { type: DataTypes.STRING(2048), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_public: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    social_links: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    stage_name: { type: DataTypes.STRING, allowNull: true },
    total_earnings: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'artist_profiles',
      timestamps: false,
      underscored: true,
    },
  );
}
