import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `replay_videos`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineReplayVideo(sequelize) {
  return sequelize.define(
    'ReplayVideo',
    {
    artist_id: { type: DataTypes.UUID, allowNull: true },
    competition_id: { type: DataTypes.UUID, allowNull: true },
    concert_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_by: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    duel_id: { type: DataTypes.UUID, allowNull: true },
    duration: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_premium: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    recorded_date: { type: DataTypes.DATE, allowNull: false },
    replay_price: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    source_type: { type: DataTypes.STRING, allowNull: false },
    thumbnail_url: { type: DataTypes.STRING(2048), allowNull: true },
    title: { type: DataTypes.STRING, allowNull: false },
    video_url: { type: DataTypes.STRING(2048), allowNull: false },
    views_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'replay_videos',
      timestamps: true,
      createdAt: false,
      updatedAt: false,
      deletedAt: 'deleted_at',
      paranoid: true,
      underscored: true,
    },
  );
}
