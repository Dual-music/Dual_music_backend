import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `gift_transactions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineGiftTransaction(sequelize) {
  return sequelize.define(
    'GiftTransaction',
    {
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    duel_id: { type: DataTypes.UUID, allowNull: true },
    from_user_id: { type: DataTypes.UUID, allowNull: false },
    gift_id: { type: DataTypes.UUID, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    live_id: { type: DataTypes.UUID, allowNull: true },
    to_user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'gift_transactions',
      timestamps: false,
      underscored: true,
    },
  );
}
