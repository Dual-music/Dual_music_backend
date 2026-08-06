import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `profiles`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run `npm run db:generate:schema`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineProfile(sequelize) {
  return sequelize.define(
    'Profile',
    {
    avatar_url: { type: DataTypes.STRING(2048), allowNull: true },
    banned_at: { type: DataTypes.DATE, allowNull: true },
    banned_is_permanent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    banned_reason: { type: DataTypes.TEXT, allowNull: true },
    banned_until: { type: DataTypes.DATE, allowNull: true },
    bio: { type: DataTypes.TEXT, allowNull: true },
    birth_date: { type: DataTypes.DATEONLY, allowNull: true },
    gender: { type: DataTypes.STRING, allowNull: true },
    country_code: { type: DataTypes.STRING, allowNull: true, defaultValue: 'FR' },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    email: { type: DataTypes.STRING, allowNull: false },
    full_name: { type: DataTypes.STRING, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    is_banned: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    is_public: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    phone: { type: DataTypes.STRING, allowNull: true },
    phone_country_code: { type: DataTypes.STRING, allowNull: true, defaultValue: '+33' },
    referral_code: { type: DataTypes.STRING, allowNull: true },
    referred_by: { type: DataTypes.UUID, allowNull: true },
    social_links: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'profiles',
      timestamps: false,
      underscored: true,
    },
  );
}
