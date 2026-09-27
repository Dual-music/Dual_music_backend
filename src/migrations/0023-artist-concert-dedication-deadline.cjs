/* eslint-disable */
'use strict';

/**
 * Migration 0023 — `artist_concerts.dedication_submission_deadline` : date limite (optionnelle)
 * au-delà de laquelle les fans ne peuvent plus demander de dédicace à l'artiste pour CE concert,
 * saisie par l'artiste à la création si « Dédicaces » est coché — même principe que
 * `sponsor_submission_deadline`, vérifiée dans `concert.service.js#resolveDedicationArtist`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('artist_concerts', 'dedication_submission_deadline', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('artist_concerts', 'dedication_submission_deadline');
  },
};
