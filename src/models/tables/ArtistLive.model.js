import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `artist_lives`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineArtistLive(sequelize) {
  return sequelize.define(
    'ArtistLive',
    {
    artist_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_replay_available: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    recording_url: { type: DataTypes.STRING(2048), allowNull: true },
    room_id: { type: DataTypes.STRING, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'live' },
    stream_url: { type: DataTypes.STRING(2048), allowNull: true },
    title: { type: DataTypes.STRING, allowNull: true },
    viewer_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    },
    {
      tableName: 'artist_lives',
      timestamps: false,
      underscored: true,
    },
  );
}
