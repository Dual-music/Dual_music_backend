import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `duel_requests`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineDuelRequest(sequelize) {
  return sequelize.define(
    'DuelRequest',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    manager_id: { type: DataTypes.UUID, allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: true },
    opponent_id: { type: DataTypes.UUID, allowNull: false },
    proposed_date: { type: DataTypes.DATE, allowNull: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'duel_requests',
      timestamps: false,
      underscored: true,
    },
  );
}
