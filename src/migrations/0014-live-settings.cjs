/* eslint-disable */
'use strict';

/**
 * Migration 0014 — réglages par live (dédicaces + invités).
 * `artist_lives` (spontaneous lives) n'avait — contrairement à `artist_concerts` — aucun moyen
 * de désactiver les dédicaces ni de fixer un prix minimum propre à l'artiste (uniquement un
 * défaut GLOBAL dans `platform_settings.economic_config`), ni de désactiver les demandes
 * d'invité. Ajoute :
 *  - `allows_dedications` (BOOLEAN, défaut true) — parité avec `artist_concerts.allows_dedications`.
 *  - `dedication_min_price_credits` (DECIMAL, nullable) — surcharge du défaut global si renseigné.
 *  - `allow_guests` (BOOLEAN, défaut true) — l'artiste peut fermer les demandes « lever la main ».
 * Réversible : `down` retire les 3 colonnes.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('artist_lives', 'allows_dedications', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn('artist_lives', 'dedication_min_price_credits', {
      type: Sequelize.DECIMAL(18, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('artist_lives', 'allow_guests', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('artist_lives', 'allow_guests');
    await queryInterface.removeColumn('artist_lives', 'dedication_min_price_credits');
    await queryInterface.removeColumn('artist_lives', 'allows_dedications');
  },
};
