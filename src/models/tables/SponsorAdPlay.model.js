import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `sponsor_ad_plays`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineSponsorAdPlay(sequelize) {
  return sequelize.define(
    'SponsorAdPlay',
    {
    ad_video_id: { type: DataTypes.UUID, allowNull: false },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    event_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    played_at: { type: DataTypes.DATE, allowNull: false },
    request_id: { type: DataTypes.UUID, allowNull: true },
    sponsor_paid_credits: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    triggered_by: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'sponsor_ad_plays',
      timestamps: false,
      underscored: true,
    },
  );
}
