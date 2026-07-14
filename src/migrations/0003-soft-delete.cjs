/* eslint-disable */
'use strict';

/**
 * Migration 0003 — soft delete (paranoid) on user-content tables.
 * Adds a nullable `deleted_at` column so `destroy()` soft-deletes and reads
 * exclude removed rows (§5). Reversible: `down` drops the columns.
 */
const TABLES = ['comments', 'blogs', 'lifestyle_videos', 'replay_videos'];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await queryInterface.addColumn(table, 'deleted_at', { type: Sequelize.DATE, allowNull: true });
      await queryInterface.addIndex(table, ['deleted_at'], { name: `ix_${table}_deleted_at` });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      await queryInterface.removeIndex(table, `ix_${table}_deleted_at`);
      await queryInterface.removeColumn(table, 'deleted_at');
    }
  },
};
