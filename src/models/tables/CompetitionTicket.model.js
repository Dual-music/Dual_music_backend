import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `competition_tickets`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCompetitionTicket(sequelize) {
  return sequelize.define(
    'CompetitionTicket',
    {
    amount_paid: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    competition_id: { type: DataTypes.UUID, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    paid_at: { type: DataTypes.DATE, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'competition_tickets',
      timestamps: false,
      underscored: true,
    },
  );
}
