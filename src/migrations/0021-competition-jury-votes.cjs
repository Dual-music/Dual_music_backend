/* eslint-disable */
'use strict';

/**
 * Migration 0021 — ajoute `competition_candidates.jury_votes`.
 *
 * Permet au manager de saisir un nombre de voix cumulées par un jury (hors ligne — utile aussi
 * bien en présentiel qu'en ligne) pour chaque candidat, additionné aux votes payants et aux
 * cadeaux dans le classement final (`finalizeRanking`) et le classement en direct
 * (`listCandidates`). Distinct de `total_votes` (votes payants, alimentés par la procédure
 * `competition_vote`) pour garder les deux sources auditable séparément.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('competition_candidates', 'jury_votes', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('competition_candidates', 'jury_votes');
  },
};
