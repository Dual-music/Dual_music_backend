import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `email_notification_preferences`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineEmailNotificationPreference(sequelize) {
  return sequelize.define(
    'EmailNotificationPreference',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    email_assignments: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_concerts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_duels: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_gifts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_lives: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_requests: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    email_votes: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Préférence push (opt-out) — défaut activé ; respectée par notifyUser.
    push_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'email_notification_preferences',
      timestamps: false,
      underscored: true,
    },
  );
}
