import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `video_interactions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineVideoInteraction(sequelize) {
  return sequelize.define(
    'VideoInteraction',
    {
    comment_text: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    interaction_type: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    video_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'video_interactions',
      timestamps: false,
      underscored: true,
    },
  );
}
