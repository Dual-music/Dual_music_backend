/* eslint-disable */
'use strict';

/**
 * Migration 0025 — `stream_attendance` : journal (nouveau, n'existait pas) de qui a réellement
 * suivi un direct (live/concert/duel/compétition), rempli en direct à la connexion Socket.IO
 * (voir `realtime/index.js`). Sert à accorder gratuitement le replay payant à ceux qui ont suivi
 * le direct — `replay.service.js#computeAccess` consulte cette table pour les spectateurs qui
 * n'ont ni acheté d'accès ni sont l'artiste/organisateur.
 *
 * Contrainte unique (user_id, event_type, event_id) : un rejoin répété du même direct par le même
 * utilisateur ne doit pas créer plusieurs lignes (upsert-safe, `INSERT ... ON DUPLICATE KEY`).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stream_attendance', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      event_type: { type: Sequelize.STRING, allowNull: false },
      event_id: { type: Sequelize.UUID, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('stream_attendance', ['user_id', 'event_type', 'event_id'], {
      unique: true,
      name: 'stream_attendance_user_event_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stream_attendance');
  },
};
