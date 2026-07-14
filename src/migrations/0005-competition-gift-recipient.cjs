/* eslint-disable */
'use strict';

/**
 * Migration 0005 — competition gift recipient (manager tips).
 * A competition gift can now target the competition manager instead of a
 * candidate. Makes `competition_gifts.candidate_id` nullable and adds a nullable
 * `recipient_user_id` (the manager/user recipient). Exactly one is set per row.
 * Reversible: `down` drops the column and restores NOT NULL on candidate_id.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('competition_gifts', 'candidate_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('competition_gifts', 'recipient_user_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('competition_gifts', 'recipient_user_id');
    await queryInterface.changeColumn('competition_gifts', 'candidate_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};
