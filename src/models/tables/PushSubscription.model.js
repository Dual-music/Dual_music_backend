import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `push_subscriptions`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function definePushSubscription(sequelize) {
  return sequelize.define(
    'PushSubscription',
    {
    auth: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    endpoint: { type: DataTypes.STRING, allowNull: false },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    p256dh: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'push_subscriptions',
      timestamps: false,
      underscored: true,
    },
  );
}
