import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `season_winners`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineSeasonWinner(sequelize) {
  return sequelize.define(
    'SeasonWinner',
    {
    counter_location: { type: DataTypes.STRING, allowNull: true },
    counter_notes: { type: DataTypes.TEXT, allowNull: true },
    counter_proposed_at: { type: DataTypes.DATE, allowNull: true },
    counter_when: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    distributed_at: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    meeting_location: { type: DataTypes.STRING, allowNull: true },
    meeting_notes: { type: DataTypes.TEXT, allowNull: true },
    meeting_proposed_at: { type: DataTypes.DATE, allowNull: true },
    meeting_proposed_by: { type: DataTypes.UUID, allowNull: true },
    meeting_status: { type: DataTypes.STRING, allowNull: false },
    meeting_when: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    notified_winner_at: { type: DataTypes.DATE, allowNull: true },
    rank_position: { type: DataTypes.INTEGER, allowNull: false },
    received_at: { type: DataTypes.DATE, allowNull: true },
    reward_status: { type: DataTypes.STRING, allowNull: false },
    season_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'season_winners',
      timestamps: false,
      underscored: true,
    },
  );
}
