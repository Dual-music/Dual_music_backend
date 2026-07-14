import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `competition_candidates`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCompetitionCandidate(sequelize) {
  return sequelize.define(
    'CompetitionCandidate',
    {
    artist_id: { type: DataTypes.UUID, allowNull: false },
    competition_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    entry_fee_amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    entry_fee_paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    final_rank: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    pitch: { type: DataTypes.STRING, allowNull: true },
    rejection_reason: { type: DataTypes.TEXT, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    reviewed_by: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    total_gifts_credits: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    total_votes: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    video_demo_url: { type: DataTypes.STRING(2048), allowNull: true },
    },
    {
      tableName: 'competition_candidates',
      timestamps: false,
      underscored: true,
    },
  );
}
