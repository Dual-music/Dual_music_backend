import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `competitions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCompetition(sequelize) {
  return sequelize.define(
    'Competition',
    {
    application_deadline: { type: DataTypes.DATE, allowNull: false },
    application_opens_at: { type: DataTypes.DATE, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    commune: { type: DataTypes.STRING, allowNull: true },
    country: { type: DataTypes.STRING, allowNull: true },
    cover_url: { type: DataTypes.STRING(2048), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    current_performer_duration_sec: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    current_performer_id: { type: DataTypes.UUID, allowNull: true },
    current_performer_started_at: { type: DataTypes.DATE, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    district: { type: DataTypes.STRING, allowNull: true },
    eligibility_scope: { type: DataTypes.STRING, allowNull: false },
    eligible_countries: { type: DataTypes.STRING, allowNull: false },
    end_at: { type: DataTypes.DATE, allowNull: false },
    entry_fee_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    entry_fee_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    forced_focus_participant_id: { type: DataTypes.UUID, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_public_paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    livekit_room: { type: DataTypes.STRING, allowNull: true },
    manager_id: { type: DataTypes.UUID, allowNull: true },
    max_candidates: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    mode: { type: DataTypes.STRING, allowNull: false },
    reward_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    reward_description: { type: DataTypes.TEXT, allowNull: true },
    sponsor_submission_deadline: { type: DataTypes.DATE, allowNull: true },
    start_at: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    venue_address: { type: DataTypes.TEXT, allowNull: true },
    venue_contact: { type: DataTypes.STRING, allowNull: true },
    venue_name: { type: DataTypes.STRING, allowNull: true },
    viewer_ticket_price: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    winner_announced_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'competitions',
      timestamps: false,
      underscored: true,
    },
  );
}
