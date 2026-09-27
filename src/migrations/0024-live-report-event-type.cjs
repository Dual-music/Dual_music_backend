/* eslint-disable */
'use strict';

/**
 * Migration 0024 — `live_reports.event_type` : `live_reports` sert de table générique pour les
 * trois entités "direct" (live / concert / duel) mais ne stockait AUCUNE colonne pour distinguer
 * laquelle un `live_id` désigne réellement — un signalement de concert ou de duel était donc
 * indiscernable d'un signalement de live une fois enregistré, empêchant l'admin de relier le
 * signalement à l'événement concerné. Défaut 'live' pour les lignes existantes (comportement
 * historique : seul le type "live" était réellement exploité).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('live_reports', 'event_type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'live',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('live_reports', 'event_type');
  },
};
