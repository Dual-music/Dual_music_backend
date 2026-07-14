import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `cinetpay_alerts`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineCinetpayAlert(sequelize) {
  return sequelize.define(
    'CinetpayAlert',
    {
    acknowledged_at: { type: DataTypes.DATE, allowNull: true },
    acknowledged_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    event: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    severity: { type: DataTypes.STRING, allowNull: false },
    transaction_id: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: 'cinetpay_alerts',
      timestamps: false,
      underscored: true,
    },
  );
}
