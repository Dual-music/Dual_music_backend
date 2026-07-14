import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `user_roles`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineUserRole(sequelize) {
  return sequelize.define(
    'UserRole',
    {
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'user_roles',
      timestamps: false,
      underscored: true,
    },
  );
}
