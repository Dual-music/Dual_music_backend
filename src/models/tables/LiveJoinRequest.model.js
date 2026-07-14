import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `live_join_requests`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLiveJoinRequest(sequelize) {
  return sequelize.define(
    'LiveJoinRequest',
    {
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    live_id: { type: DataTypes.UUID, allowNull: false },
    requested_at: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'live_join_requests',
      timestamps: false,
      underscored: true,
    },
  );
}
