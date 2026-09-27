/* eslint-disable */
'use strict';

/**
 * Migration 0018 — ajoute `gift_transactions.concert_id`.
 *
 * `send_gift_with_distribution` (procedures/wallet.sql) reçoit déjà `p_concert_id` et
 * s'en sert pour la répartition des revenus (`distribute_event_revenue`), mais ne
 * l'écrit JAMAIS dans `gift_transactions` — la table n'a que `duel_id`/`live_id`. Résultat :
 * un cadeau envoyé pendant un concert est débité/crédité correctement mais n'a AUCUNE
 * trace exploitable pour ce concert. Le classement des donateurs du concert
 * (`leaderboard.service.js` → `GIFT_ENGAGEMENT_SQL.concert`) ne compte donc QUE les
 * dédicaces (`concert_dedications`), jamais les cadeaux — d'où classement/nom du
 * meilleur donateur vides côté web (`GiftLeaderboard`) et mobile (rail « classement » +
 * nom défilant) dès qu'aucune dédicace n'a été envoyée, même si des cadeaux l'ont été.
 *
 * Pas de contrainte FK sur `concert_id` (même choix que `live_id`, voir migration 0001 :
 * aucune FK dessus) — les ids « concert » vus ici sont en pratique des `artist_concerts.id`
 * (voir migration 0015/0017), une FK vers `concerts` reproduirait le même bug.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('gift_transactions', 'concert_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex('gift_transactions', ['concert_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('gift_transactions', ['concert_id']);
    await queryInterface.removeColumn('gift_transactions', 'concert_id');
  },
};
