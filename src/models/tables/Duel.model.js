import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `duels`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineDuel(sequelize) {
  return sequelize.define(
    'Duel',
    {
    allows_sponsor_ads: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    artist1_id: { type: DataTypes.UUID, allowNull: false },
    artist2_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    current_timer_ends_at: { type: DataTypes.DATE, allowNull: true },
    current_timer_target_id: { type: DataTypes.UUID, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    manager_id: { type: DataTypes.UUID, allowNull: true },
    room_id: { type: DataTypes.STRING, allowNull: true },
    scheduled_time: { type: DataTypes.STRING, allowNull: true },
    sponsor_submission_deadline: { type: DataTypes.DATE, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: true, defaultValue: 'upcoming' },
    ticket_price: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    winner_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'duels',
      timestamps: false,
      underscored: true,
    },
  );
}
