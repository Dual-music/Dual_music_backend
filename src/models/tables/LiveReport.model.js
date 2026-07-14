import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `live_reports`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLiveReport(sequelize) {
  return sequelize.define(
    'LiveReport',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    details: { type: DataTypes.TEXT, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    live_id: { type: DataTypes.UUID, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    reviewed_by: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'live_reports',
      timestamps: false,
      underscored: true,
    },
  );
}
