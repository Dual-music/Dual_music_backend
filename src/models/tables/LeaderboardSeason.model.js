import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `leaderboard_seasons`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLeaderboardSeason(sequelize) {
  return sequelize.define(
    'LeaderboardSeason',
    {
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    end_date: { type: DataTypes.DATE, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    is_mystery_reward: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    name: { type: DataTypes.STRING, allowNull: false },
    start_date: { type: DataTypes.DATE, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'leaderboard_seasons',
      timestamps: false,
      underscored: true,
    },
  );
}
