import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `referrals`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineReferral(sequelize) {
  return sequelize.define(
    'Referral',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    referral_code: { type: DataTypes.STRING, allowNull: false },
    referred_id: { type: DataTypes.UUID, allowNull: false },
    referrer_id: { type: DataTypes.UUID, allowNull: false },
    reward_claimed: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    status: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: 'referrals',
      timestamps: false,
      underscored: true,
    },
  );
}
