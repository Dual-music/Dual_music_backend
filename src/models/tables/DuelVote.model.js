import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `duel_votes`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineDuelVote(sequelize) {
  return sequelize.define(
    'DuelVote',
    {
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    artist_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    duel_id: { type: DataTypes.UUID, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'duel_votes',
      timestamps: false,
      underscored: true,
    },
  );
}
