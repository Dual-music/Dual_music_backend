import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_badges`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserBadge(sequelize) {
  return sequelize.define(
    'UserBadge',
    {
    badge_icon: { type: DataTypes.STRING, allowNull: false },
    badge_name: { type: DataTypes.STRING, allowNull: false },
    badge_type: { type: DataTypes.STRING, allowNull: false },
    earned_at: { type: DataTypes.DATE, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    month_year: { type: DataTypes.STRING, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'user_badges',
      timestamps: false,
      underscored: true,
    },
  );
}
