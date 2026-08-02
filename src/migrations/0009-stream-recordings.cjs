/* eslint-disable */
'use strict';

/**
 * Migration 0009 — enregistrement serveur des directs (LiveKit Egress).
 * Crée `stream_recordings` : corrèle un job d'egress (async) à l'événement diffusé,
 * pour créer un `replay_videos` quand l'enregistrement se termine (webhook egress_ended).
 * Réversible : `down` supprime la table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stream_recordings', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4, allowNull: false },
      egress_id: { type: Sequelize.STRING, allowNull: true },
      room_name: { type: Sequelize.STRING, allowNull: false },
      source_type: { type: Sequelize.STRING, allowNull: false },
      source_id: { type: Sequelize.UUID, allowNull: false },
      artist_id: { type: Sequelize.UUID, allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      file_path: { type: Sequelize.STRING(2048), allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
      replay_id: { type: Sequelize.UUID, allowNull: true },
      error: { type: Sequelize.TEXT, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('stream_recordings', ['egress_id']);
    await queryInterface.addIndex('stream_recordings', ['source_type', 'source_id']);
    await queryInterface.addIndex('stream_recordings', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stream_recordings');
  },
};
