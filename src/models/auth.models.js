import { DataTypes } from 'sequelize';

/**
 * @file Hand-authored authentication models.
 *
 * These tables replace Supabase's managed `auth.*` schema with a first-party
 * identity store. `users` is the credential/source-of-truth record that every
 * content table's `*_id` foreign key ultimately references (its `id` is also the
 * `profiles.id`, preserving the frontend's "user id == profile id" contract).
 *
 * @module models/auth.models
 */

/**
 * `users` — first-party identity & credentials.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export function defineUser(sequelize) {
  return sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      /** bcrypt hash (cost 12). Null for OAuth-only accounts. Never serialized. */
      password_hash: { type: DataTypes.STRING, allowNull: true },
      phone: { type: DataTypes.STRING, allowNull: true },
      phone_country_code: { type: DataTypes.STRING, allowNull: true, defaultValue: '+33' },
      phone_verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      email_verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_banned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      banned_at: { type: DataTypes.DATE, allowNull: true },
      banned_reason: { type: DataTypes.TEXT, allowNull: true },
      last_login_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'users',
      timestamps: false,
      underscored: true,
      defaultScope: { attributes: { exclude: ['password_hash'] } },
      scopes: { withSecret: { attributes: { include: ['password_hash'] } } },
    },
  );
}

/**
 * `refresh_tokens` — rotating refresh tokens, stored hashed (never in plaintext).
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export function defineRefreshToken(sequelize) {
  return sequelize.define(
    'RefreshToken',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      user_id: { type: DataTypes.UUID, allowNull: false },
      /** SHA-256(HMAC) of the opaque refresh token. */
      token_hash: { type: DataTypes.STRING, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      /** Id of the token that superseded this one (rotation chain / reuse detection). */
      replaced_by: { type: DataTypes.UUID, allowNull: true },
      user_agent: { type: DataTypes.STRING, allowNull: true },
      ip: { type: DataTypes.STRING, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'refresh_tokens', timestamps: false, underscored: true },
  );
}

/**
 * `otp_codes` — one-time codes for phone/email verification, login and reset.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export function defineOtpCode(sequelize) {
  return sequelize.define(
    'OtpCode',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      user_id: { type: DataTypes.UUID, allowNull: true },
      channel: { type: DataTypes.ENUM('sms', 'email'), allowNull: false },
      /** Phone number or email the code was sent to. */
      destination: { type: DataTypes.STRING, allowNull: false },
      /** HMAC-SHA256 of the numeric code. */
      code_hash: { type: DataTypes.STRING, allowNull: false },
      purpose: { type: DataTypes.STRING, allowNull: false, defaultValue: 'phone_verify' },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      consumed_at: { type: DataTypes.DATE, allowNull: true },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'otp_codes', timestamps: false, underscored: true },
  );
}

/**
 * `oauth_accounts` — linked third-party identities (e.g. Google).
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export function defineOAuthAccount(sequelize) {
  return sequelize.define(
    'OAuthAccount',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      user_id: { type: DataTypes.UUID, allowNull: false },
      provider: { type: DataTypes.STRING, allowNull: false },
      provider_account_id: { type: DataTypes.STRING, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'oauth_accounts', timestamps: false, underscored: true },
  );
}

/**
 * Registry of hand-authored auth models, shaped like the generated registry.
 * @type {Array<{ name: string, define: (sequelize: import('sequelize').Sequelize) => import('sequelize').ModelStatic<any> }>}
 */
export const authModels = [
  { name: 'User', define: defineUser },
  { name: 'RefreshToken', define: defineRefreshToken },
  { name: 'OtpCode', define: defineOtpCode },
  { name: 'OAuthAccount', define: defineOAuthAccount },
];

export default authModels;
