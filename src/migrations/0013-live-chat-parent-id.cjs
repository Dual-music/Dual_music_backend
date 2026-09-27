/* eslint-disable */
'use strict';

/**
 * Migration 0013 — fil de discussion pour le chat des lives.
 * `live_chat_messages` était la seule table de chat d'événement sans `parent_id` (duel/concert/
 * competition l'ont depuis la migration initiale) : les réponses envoyées par les clients étaient
 * silencieusement ignorées par le serveur, donc jamais affichées comme réponse. Ajoute la colonne
 * + FK auto-référencée + index, à l'identique de `duel_chat_messages`/`concert_chat_messages`.
 * Réversible : `down` retire la contrainte, l'index puis la colonne.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('live_chat_messages', 'parent_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex('live_chat_messages', ['parent_id']);
    await queryInterface.addConstraint('live_chat_messages', {
      fields: ['parent_id'],
      type: 'foreign key',
      name: 'fk_live_chat_messages_parent_id',
      references: { table: 'live_chat_messages', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('live_chat_messages', 'fk_live_chat_messages_parent_id');
    await queryInterface.removeIndex('live_chat_messages', ['parent_id']);
    await queryInterface.removeColumn('live_chat_messages', 'parent_id');
  },
};
