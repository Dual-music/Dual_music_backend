import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `sponsor_ad_videos`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineSponsorAdVideo(sequelize) {
  return sequelize.define(
    'SponsorAdVideo',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    event_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    play_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    source_request_ids: { type: DataTypes.STRING, allowNull: true },
    title: { type: DataTypes.STRING, allowNull: false },
    uploaded_by: { type: DataTypes.UUID, allowNull: true },
    video_url: { type: DataTypes.STRING(2048), allowNull: false },
    },
    {
      tableName: 'sponsor_ad_videos',
      timestamps: false,
      underscored: true,
    },
  );
}
