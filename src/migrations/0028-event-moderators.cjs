/* eslint-disable */
'use strict';

/**
 * Migration 0028 — `event_moderators` (nouveau) : jusqu'à 2 spectateurs désignés par l'hôte
 * principal d'un évènement (artiste pour live/concert, manager pour duel/compétition) pour
 * l'accompagner dans la modération (bannir, masquer un message) — sans lui donner le pouvoir de
 * désactiver le chat, réservé à l'hôte. Voir `moderation.service.js#canModerateEvent`.
 *
 * Table générique (event_type distingue les 4 types), sur le même principe que `stream_bans`
 * plutôt que la table dédiée `competition_bans` — pas de passif historique à respecter ici.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('event_moderators', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4, allowNull: false },
      event_type: { type: Sequelize.STRING, allowNull: false },
      event_id: { type: Sequelize.UUID, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      appointed_by: { type: Sequelize.UUID, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('event_moderators', ['event_type', 'event_id', 'user_id'], {
      unique: true,
      name: 'event_moderators_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('event_moderators');
  },
};
