import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `account_warnings`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineAccountWarning(sequelize) {
  return sequelize.define(
    'AccountWarning',
    {
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_automatic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    issued_by: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    warning_message: { type: DataTypes.TEXT, allowNull: false },
    },
    {
      tableName: 'account_warnings',
      timestamps: false,
      underscored: true,
    },
  );
}
