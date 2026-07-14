import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `concerts`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineConcert(sequelize) {
  return sequelize.define(
    'Concert',
    {
    artist_name: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    description: { type: DataTypes.TEXT, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    image_url: { type: DataTypes.STRING(2048), allowNull: true },
    is_replay_available: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    location: { type: DataTypes.STRING, allowNull: false },
    max_tickets: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    recording_url: { type: DataTypes.STRING(2048), allowNull: true },
    scheduled_date: { type: DataTypes.DATE, allowNull: false },
    scheduled_time: { type: DataTypes.STRING, allowNull: false },
    sponsor_submission_deadline: { type: DataTypes.DATE, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'upcoming' },
    stream_url: { type: DataTypes.STRING(2048), allowNull: true },
    ticket_price: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'concerts',
      timestamps: false,
      underscored: true,
    },
  );
}
