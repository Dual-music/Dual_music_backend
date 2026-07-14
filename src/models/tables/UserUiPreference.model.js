import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_ui_preferences`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserUiPreference(sequelize) {
  return sequelize.define(
    'UserUiPreference',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reduce_animations: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    timezone: { type: DataTypes.STRING, allowNull: false },
    top_donor_animation: { type: DataTypes.STRING, allowNull: false },
    top_donor_mode: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    },
    {
      tableName: 'user_ui_preferences',
      timestamps: false,
      underscored: true,
    },
  );
}
