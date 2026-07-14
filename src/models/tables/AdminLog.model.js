import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `admin_logs`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineAdminLog(sequelize) {
  return sequelize.define(
    'AdminLog',
    {
    action_type: { type: DataTypes.STRING, allowNull: false },
    admin_id: { type: DataTypes.UUID, allowNull: true },
    admin_name: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    details: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: true },
    target_name: { type: DataTypes.STRING, allowNull: true },
    target_type: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: 'admin_logs',
      timestamps: false,
      underscored: true,
    },
  );
}
