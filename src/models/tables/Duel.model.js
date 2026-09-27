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
    accepts_sponsors: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allows_sponsor_ads: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    artist1_id: { type: DataTypes.UUID, allowNull: false },
    artist2_id: { type: DataTypes.UUID, allowNull: false },
    chat_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    current_timer_ends_at: { type: DataTypes.DATE, allowNull: true },
    current_timer_target_id: { type: DataTypes.UUID, allowNull: true },
    // Lien vers la `DuelRequest` d'origine (nul pour les duels créés autrement) — permet à
    // `approveDuelRequest` de retrouver LE duel de la demande de façon fiable, plutôt que de
    // deviner via la paire d'artistes (ambigu si un même duo a plusieurs demandes dans le temps).
    duel_request_id: { type: DataTypes.UUID, allowNull: true, unique: true },
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
