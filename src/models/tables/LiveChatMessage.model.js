import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `live_chat_messages`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLiveChatMessage(sequelize) {
  return sequelize.define(
    'LiveChatMessage',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_moderated: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    live_id: { type: DataTypes.UUID, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'live_chat_messages',
      timestamps: false,
      underscored: true,
    },
  );
}
