import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `duel_ads`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineDuelAd(sequelize) {
  return sequelize.define(
    'DuelAd',
    {
    content_url: { type: DataTypes.STRING(2048), allowNull: false },
    created_by: { type: DataTypes.UUID, allowNull: true },
    duel_id: { type: DataTypes.UUID, allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    played_at: { type: DataTypes.DATE, allowNull: true },
    scheduled_time: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: 'duel_ads',
      timestamps: false,
      underscored: true,
    },
  );
}
