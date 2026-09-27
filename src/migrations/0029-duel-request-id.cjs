/* eslint-disable */
'use strict';

/**
 * Migration 0029 — `duels.duel_request_id` (nouveau) : lien vers la `DuelRequest` d'origine.
 *
 * Sans ça, `approveDuelRequest` n'avait aucun moyen fiable de retrouver « le » duel d'une
 * demande déjà approuvée (un second appel — double-clic, retry réseau — créait donc un second
 * duel au lieu de mettre à jour le premier avec les dernières valeurs saisies par l'admin).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('duels', 'duel_request_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex('duels', ['duel_request_id'], {
      unique: true,
      name: 'duels_duel_request_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('duels', 'duels_duel_request_id_unique');
    await queryInterface.removeColumn('duels', 'duel_request_id');
  },
};
