/* eslint-disable */
'use strict';

/**
 * Migration 0010 — acceptation des sponsors par compétition.
 * Ajoute `accepts_sponsors` (BOOLEAN, défaut TRUE) sur `competitions` : le manager choisit à
 * la création si la compétition accepte des sponsors. Si false, elle n'apparaît pas dans les
 * pages sponsor et toute demande de sponsoring est refusée côté serveur.
 * Réversible : `down` la supprime.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('competitions', 'accepts_sponsors', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('competitions', 'accepts_sponsors');
  },
};
