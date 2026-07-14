import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `sponsor_requests`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineSponsorRequest(sequelize) {
  return sequelize.define(
    'SponsorRequest',
    {
    approved_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    description: { type: DataTypes.TEXT, allowNull: false },
    event_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    media_duration_seconds: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    media_type: { type: DataTypes.STRING, allowNull: false },
    media_url: { type: DataTypes.STRING(2048), allowNull: false },
    paid_at: { type: DataTypes.DATE, allowNull: true },
    price_credits: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    rejected_reason: { type: DataTypes.TEXT, allowNull: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    reviewed_by: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'sponsor_requests',
      timestamps: false,
      underscored: true,
    },
  );
}
