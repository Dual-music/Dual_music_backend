/* eslint-disable */
'use strict';

/**
 * Migration 0030 — `competition_candidates.refunded_at` (nouveau).
 *
 * Le manager peut désormais retirer un candidat déjà approuvé (voir
 * `competition.service.js#removeCandidate`) ; si sa candidature avait des frais d'inscription
 * réellement encaissés (`entry_fee_paid = true`), le montant est recrédité sur son portefeuille
 * — ce marqueur évite un double remboursement en cas de rejeu.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('competition_candidates', 'refunded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('competition_candidates', 'refunded_at');
  },
};
