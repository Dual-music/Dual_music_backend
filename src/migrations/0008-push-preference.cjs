/* eslint-disable */
'use strict';

/**
 * Migration 0008 — préférence de notifications push.
 * Ajoute `push_enabled` (BOOLEAN, défaut TRUE) sur `email_notification_preferences` :
 * l'utilisateur peut désactiver les notifications push (opt-out). Respecté par notifyUser.
 * Réversible : `down` la supprime.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('email_notification_preferences', 'push_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('email_notification_preferences', 'push_enabled');
  },
};
