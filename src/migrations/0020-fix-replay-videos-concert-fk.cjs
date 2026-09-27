/* eslint-disable */
'use strict';

/**
 * Migration 0020 — corrige la FK polymorphe de `replay_videos.concert_id`.
 *
 * Même cause et même remède que les migrations 0015 (`concert_dedications.concert_id`) et
 * 0017 (`concert_chat_messages.concert_id`) : `recording.service.js#concatenateSession` crée
 * le replay avec `eventId: rec.source_id`, qui pour un concert est un `artist_concerts.id`
 * (la table `concerts` — posée à l'initialisation, jamais utilisée en pratique — est vide) ;
 * la contrainte posée à l'initialisation référence QUE `concerts.id`. Résultat : sauvegarder
 * l'enregistrement d'un concert créé par un artiste viole cette contrainte et échoue
 * (`SequelizeForeignKeyConstraintError` / `ER_NO_REFERENCED_ROW_2`, `concert_id` FK), sans
 * jamais produire de replay — la session finit `failed` en silence pour l'hôte.
 *
 * Reproduit empiriquement le 2026-09-04 : `concatenateSession` sur une session de recording
 * `source_type: 'concert'` avec un `artist_concerts.id` réel lève
 * `Cannot add or update a child row... CONSTRAINT fk_replay_videos_concert_id_95`.
 *
 * MySQL ne supporte pas les FK conditionnelles/polymorphes ; `createReplay` ne valide déjà
 * pas l'existence de `eventId` aujourd'hui, donc retirer la contrainte ne change pas le
 * profil de risque. Réversible : `down` la repose (revient au comportement cassé pour les
 * replays de concerts créés par un artiste, à dessein).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('replay_videos', 'fk_replay_videos_concert_id_95');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addConstraint('replay_videos', {
      fields: ['concert_id'],
      type: 'foreign key',
      name: 'fk_replay_videos_concert_id_95',
      references: { table: 'concerts', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },
};
