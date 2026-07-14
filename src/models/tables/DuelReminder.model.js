import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `duel_reminders`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineDuelReminder(sequelize) {
  return sequelize.define(
    'DuelReminder',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    duel_id: { type: DataTypes.UUID, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    reminder_type: { type: DataTypes.STRING, allowNull: false },
    sent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'duel_reminders',
      timestamps: false,
      underscored: true,
    },
  );
}
