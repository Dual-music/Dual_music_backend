/* eslint-disable */
'use strict';

/**
 * Migration 0015 — corrige la FK polymorphe de `concert_dedications.concert_id`.
 * `concert_dedications` sert à la fois aux concerts ET aux lives (`concert_type`
 * discrimine 'artist_concert' vs 'artist_live'), mais la contrainte de clé étrangère posée à
 * l'initialisation ne référence QUE `concerts.id` — inconditionnellement. Résultat : TOUTE
 * dédicace de LIVE (où `concert_id` pointe en réalité vers `artist_lives.id`) viole cette
 * contrainte et échoue en 500 (`ER_NO_REFERENCED_ROW_2`), quel que soit le live.
 * MySQL ne supporte pas les FK conditionnelles/polymorphes ("référence `concerts` SI type=A,
 * sinon `artist_lives`") — l'intégrité référentielle est déjà garantie côté application
 * (`resolveDedicationArtist` vérifie l'existence de la ligne concert/live avant l'insertion).
 * On retire donc cette contrainte trop restrictive.
 * Réversible : `down` la repose (revient au comportement cassé pour les lives, à dessein).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('concert_dedications', 'fk_concert_dedications_concert_id_44');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addConstraint('concert_dedications', {
      fields: ['concert_id'],
      type: 'foreign key',
      name: 'fk_concert_dedications_concert_id_44',
      references: { table: 'concerts', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },
};
