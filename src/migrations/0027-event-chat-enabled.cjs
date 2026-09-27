/* eslint-disable */
'use strict';

/**
 * Migration 0027 — `chat_enabled` (BOOLEAN, défaut true) sur les 4 tables d'évènement en direct
 * (`artist_lives`, `artist_concerts`, `duels`, `competitions`). Permet à l'hôte principal (artiste
 * pour live/concert, manager pour duel/compétition) de désactiver entièrement le chat de son
 * évènement — `chat.service.js#postMessage` refuse alors tout nouveau message, pour tout le monde.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of ['artist_lives', 'artist_concerts', 'duels', 'competitions']) {
      await queryInterface.addColumn(table, 'chat_enabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
  },

  async down(queryInterface) {
    for (const table of ['artist_lives', 'artist_concerts', 'duels', 'competitions']) {
      await queryInterface.removeColumn(table, 'chat_enabled');
    }
  },
};
