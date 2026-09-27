import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `event_moderators` (new — see migration 0028).
 * Up to 2 viewers appointed by an event's primary host (artist for live/concert,
 * manager for duel/competition) to help moderate (ban, hide messages) — never
 * the chat on/off toggle, which stays host-only. See `moderation.service.js`.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineEventModerator(sequelize) {
  return sequelize.define(
    'EventModerator',
    {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    event_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    appointed_by: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'event_moderators',
      timestamps: false,
      underscored: true,
    },
  );
}
