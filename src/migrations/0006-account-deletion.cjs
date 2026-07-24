/* eslint-disable */
'use strict';

/**
 * Migration 0006 — suppression de compte à effet différé.
 * Ajoute une colonne nullable `deletion_scheduled_at` sur `users` : quand elle est
 * renseignée, le compte sera purgé (banni) à cette date (now + 20 jours), sauf annulation
 * par l'utilisateur avant l'échéance. Réversible : `down` la supprime.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'deletion_scheduled_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'deletion_scheduled_at');
  },
};
