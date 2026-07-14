import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `leaderboard_rewards`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLeaderboardReward(sequelize) {
  return sequelize.define(
    'LeaderboardReward',
    {
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    credits_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    physical_description: { type: DataTypes.TEXT, allowNull: true },
    rank_position: { type: DataTypes.INTEGER, allowNull: false },
    reward_type: { type: DataTypes.STRING, allowNull: false },
    season_id: { type: DataTypes.UUID, allowNull: false },
    virtual_gift_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'leaderboard_rewards',
      timestamps: false,
      underscored: true,
    },
  );
}
