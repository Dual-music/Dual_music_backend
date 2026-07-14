import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `concert_dedications`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineConcertDedication(sequelize) {
  return sequelize.define(
    'ConcertDedication',
    {
    artist_id: { type: DataTypes.UUID, allowNull: false },
    concert_id: { type: DataTypes.UUID, allowNull: false },
    concert_type: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    delivered_at: { type: DataTypes.DATE, allowNull: true },
    fan_id: { type: DataTypes.UUID, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    paid_at: { type: DataTypes.DATE, allowNull: false },
    price_credits: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: 'concert_dedications',
      timestamps: false,
      underscored: true,
    },
  );
}
