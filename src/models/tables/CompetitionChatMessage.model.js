import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `competition_chat_messages`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCompetitionChatMessage(sequelize) {
  return sequelize.define(
    'CompetitionChatMessage',
    {
    competition_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_moderated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    parent_id: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'competition_chat_messages',
      timestamps: false,
      underscored: true,
    },
  );
}
