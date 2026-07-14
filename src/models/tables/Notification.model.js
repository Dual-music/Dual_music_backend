import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `notifications`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineNotification(sequelize) {
  return sequelize.define(
    'Notification',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    data: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    title: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'notifications',
      timestamps: false,
      underscored: true,
    },
  );
}
