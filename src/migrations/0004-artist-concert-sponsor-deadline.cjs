/* eslint-disable */
'use strict';

/**
 * Migration 0004 — sponsor submission deadline on artist_concerts.
 * Adds a nullable `sponsor_submission_deadline` DATE column so an artist (or an
 * admin) can close sponsor candidacies for an artist concert (F1), mirroring the
 * existing column on duels/concerts/competitions. Reversible: `down` drops it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('artist_concerts', 'sponsor_submission_deadline', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('artist_concerts', 'sponsor_submission_deadline');
  },
};
