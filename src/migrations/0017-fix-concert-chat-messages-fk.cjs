/* eslint-disable */
'use strict';

/**
 * Migration 0017 — corrige la FK polymorphe de `concert_chat_messages.concert_id`.
 *
 * Le chat du concert (`chatService.CHAT_BINDINGS.concert`, fk `concert_id`) reçoit
 * l'id affiché par la page `ConcertLive` — laquelle résout d'abord un concert créé
 * par un artiste (`artist_concerts`, via `listArtistConcerts()`/`getArtistConcert()`)
 * et ne retombe sur `concerts` que si aucune ligne `artist_concerts` ne correspond
 * (voir `duel_music_frontend/src/pages/ConcertLive.tsx`). `concert_id` pointe donc
 * en pratique vers `artist_concerts.id` la plupart du temps (actuellement la table
 * `concerts` est même vide en usage réel), mais la contrainte posée à l'initialisation
 * référence QUE `concerts.id` — inconditionnellement. Résultat : poster un message
 * dans le chat d'un concert créé par un artiste viole cette contrainte et échoue en
 * 500 (`SequelizeForeignKeyConstraintError` / `ER_NO_REFERENCED_ROW_2`), silencieusement
 * avalé côté client — d'où "les commentaires ne passent pas" sur CONCERT (web + mobile,
 * le backend est partagé) alors que LIVE fonctionne (`live_chat_messages` n'a jamais eu
 * cette contrainte, voir migration 0001).
 *
 * Reproduit empiriquement : `chatService.postMessage(CHAT_BINDINGS.concert, {...})`
 * avec un `artist_concerts.id` réel lève `SequelizeForeignKeyConstraintError` sur
 * `fk_concert_chat_messages_concert_id_40`.
 *
 * Même cause et même remède que la migration 0015 (`concert_dedications.concert_id`) :
 * MySQL ne supporte pas les FK conditionnelles/polymorphes ("référence `concerts` SI
 * la ligne existe, sinon `artist_concerts`") — il n'y a de toute façon aucune validation
 * applicative de l'existence de `eventId` dans `chatService.postMessage` aujourd'hui, donc
 * retirer la contrainte ne change pas le profil de risque (un id invalide n'était déjà pas
 * rejeté avant que la contrainte matche par coïncidence). On retire donc cette contrainte
 * trop restrictive.
 * Réversible : `down` la repose (revient au comportement cassé pour les concerts créés par
 * un artiste, à dessein).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('concert_chat_messages', 'fk_concert_chat_messages_concert_id_40');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addConstraint('concert_chat_messages', {
      fields: ['concert_id'],
      type: 'foreign key',
      name: 'fk_concert_chat_messages_concert_id_40',
      references: { table: 'concerts', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },
};
