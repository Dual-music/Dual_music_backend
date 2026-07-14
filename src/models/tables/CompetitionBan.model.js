import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `competition_bans`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCompetitionBan(sequelize) {
  return sequelize.define(
    'CompetitionBan',
    {
    banned_by: { type: DataTypes.UUID, allowNull: false },
    banned_user_id: { type: DataTypes.UUID, allowNull: false },
    competition_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'competition_bans',
      timestamps: false,
      underscored: true,
    },
  );
}
