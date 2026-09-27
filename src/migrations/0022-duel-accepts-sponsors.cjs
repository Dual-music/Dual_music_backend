/* eslint-disable */
'use strict';

/**
 * Migration 0022 — `duels.accepts_sponsors` : contrairement à la compétition (auto-gérée par le
 * manager), c'est l'ADMIN qui décide au moment d'approuver une demande de duel (assignation du
 * manager) si des demandes de sponsor sont acceptées pour ce duel — même sémantique que
 * `competitions.accepts_sponsors`, consommée par le même contrôle générique dans
 * `sponsor.service.js#createRequest`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('duels', 'accepts_sponsors', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('duels', 'accepts_sponsors');
  },
};
