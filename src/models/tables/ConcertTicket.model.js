import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `concert_tickets`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineConcertTicket(sequelize) {
  return sequelize.define(
    'ConcertTicket',
    {
    concert_id: { type: DataTypes.UUID, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    price_paid: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    purchased_at: { type: DataTypes.DATE, allowNull: false },
    qr_code_url: { type: DataTypes.STRING(2048), allowNull: true },
    ticket_code: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    validated_at: { type: DataTypes.DATE, allowNull: true },
    validated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'concert_tickets',
      timestamps: false,
      underscored: true,
    },
  );
}
