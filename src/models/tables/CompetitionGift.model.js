import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `competition_gifts`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCompetitionGift(sequelize) {
  return sequelize.define(
    'CompetitionGift',
    {
    candidate_id: { type: DataTypes.UUID, allowNull: true },
    competition_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    credits: { type: DataTypes.INTEGER, allowNull: false },
    gift_id: { type: DataTypes.UUID, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    recipient_user_id: { type: DataTypes.UUID, allowNull: true },
    sender_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'competition_gifts',
      timestamps: false,
      underscored: true,
    },
  );
}
