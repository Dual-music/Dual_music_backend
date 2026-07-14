import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `artist_requests`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineArtistRequest(sequelize) {
  return sequelize.define(
    'ArtistRequest',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    description: { type: DataTypes.TEXT, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    justification_document_url: { type: DataTypes.STRING(2048), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    reviewed_by: { type: DataTypes.UUID, allowNull: true },
    social_links: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    status: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'artist_requests',
      timestamps: false,
      underscored: true,
    },
  );
}
