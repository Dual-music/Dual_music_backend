import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `artist_concerts`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineArtistConcert(sequelize) {
  return sequelize.define(
    'ArtistConcert',
    {
    allows_dedications: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allows_sponsor_ads: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approval_status: { type: DataTypes.STRING, allowNull: false },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    approved_by: { type: DataTypes.UUID, allowNull: true },
    artist_id: { type: DataTypes.UUID, allowNull: false },
    cover_image_url: { type: DataTypes.STRING(2048), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    description: { type: DataTypes.TEXT, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_replay_available: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    max_tickets: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    recording_url: { type: DataTypes.STRING(2048), allowNull: true },
    rejection_reason: { type: DataTypes.TEXT, allowNull: true },
    revenue: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    scheduled_date: { type: DataTypes.DATE, allowNull: false },
    sponsor_submission_deadline: { type: DataTypes.DATE, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'upcoming' },
    stream_url: { type: DataTypes.STRING(2048), allowNull: true },
    ticket_price: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    tickets_sold: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    title: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: 'artist_concerts',
      timestamps: false,
      underscored: true,
    },
  );
}
