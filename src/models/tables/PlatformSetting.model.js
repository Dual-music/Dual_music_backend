import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `platform_settings`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function definePlatformSetting(sequelize) {
  return sequelize.define(
    'PlatformSetting',
    {
    key: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    value: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    },
    {
      tableName: 'platform_settings',
      timestamps: false,
      underscored: true,
    },
  );
}
