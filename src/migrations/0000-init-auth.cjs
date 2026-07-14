/* eslint-disable */
'use strict';

/**
 * Auth schema migration (runs first — content FKs reference `users`).
 * Creates: users, refresh_tokens, otp_codes, oauth_accounts.
 * Reversible: `down` drops them in reverse dependency order.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const opts = { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' };
    try {
      await queryInterface.createTable(
        'users',
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())') },
          email: { type: Sequelize.STRING, allowNull: false, unique: true },
          password_hash: { type: Sequelize.STRING, allowNull: true },
          phone: { type: Sequelize.STRING, allowNull: true },
          phone_country_code: { type: Sequelize.STRING, allowNull: true, defaultValue: '+33' },
          phone_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          email_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          is_banned: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          banned_at: { type: Sequelize.DATE, allowNull: true },
          banned_reason: { type: Sequelize.TEXT, allowNull: true },
          last_login_at: { type: Sequelize.DATE, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        },
        opts,
      );
      await queryInterface.addIndex('users', ['phone'], { transaction });

      await queryInterface.createTable(
        'refresh_tokens',
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())') },
          user_id: { type: Sequelize.UUID, allowNull: false },
          token_hash: { type: Sequelize.STRING, allowNull: false },
          expires_at: { type: Sequelize.DATE, allowNull: false },
          revoked_at: { type: Sequelize.DATE, allowNull: true },
          replaced_by: { type: Sequelize.UUID, allowNull: true },
          user_agent: { type: Sequelize.STRING, allowNull: true },
          ip: { type: Sequelize.STRING, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        },
        opts,
      );
      await queryInterface.addIndex('refresh_tokens', ['user_id'], { transaction });
      await queryInterface.addIndex('refresh_tokens', ['token_hash'], { transaction });

      await queryInterface.createTable(
        'otp_codes',
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())') },
          user_id: { type: Sequelize.UUID, allowNull: true },
          channel: { type: Sequelize.ENUM('sms', 'email'), allowNull: false },
          destination: { type: Sequelize.STRING, allowNull: false },
          code_hash: { type: Sequelize.STRING, allowNull: false },
          purpose: { type: Sequelize.STRING, allowNull: false, defaultValue: 'phone_verify' },
          expires_at: { type: Sequelize.DATE, allowNull: false },
          consumed_at: { type: Sequelize.DATE, allowNull: true },
          attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        },
        opts,
      );
      await queryInterface.addIndex('otp_codes', ['destination', 'purpose'], { transaction });

      await queryInterface.createTable(
        'oauth_accounts',
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())') },
          user_id: { type: Sequelize.UUID, allowNull: false },
          provider: { type: Sequelize.STRING, allowNull: false },
          provider_account_id: { type: Sequelize.STRING, allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        },
        opts,
      );
      await queryInterface.addIndex('oauth_accounts', ['provider', 'provider_account_id'], { unique: true, transaction });
      await queryInterface.addIndex('oauth_accounts', ['user_id'], { transaction });

      // Foreign keys
      await queryInterface.addConstraint('refresh_tokens', {
        fields: ['user_id'], type: 'foreign key', name: 'fk_refresh_tokens_user',
        references: { table: 'users', field: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE', transaction,
      });
      await queryInterface.addConstraint('otp_codes', {
        fields: ['user_id'], type: 'foreign key', name: 'fk_otp_codes_user',
        references: { table: 'users', field: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE', transaction,
      });
      await queryInterface.addConstraint('oauth_accounts', {
        fields: ['user_id'], type: 'foreign key', name: 'fk_oauth_accounts_user',
        references: { table: 'users', field: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE', transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      await queryInterface.dropTable('oauth_accounts');
      await queryInterface.dropTable('otp_codes');
      await queryInterface.dropTable('refresh_tokens');
      await queryInterface.dropTable('users');
    } finally {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  },
};
