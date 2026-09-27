/* eslint-disable */
'use strict';

/**
 * Migration 0016 — dédicaces : débit différé à l'acceptation (pas à la demande).
 * Avant : `purchase_concert_dedication_from_wallet` débitait le fan IMMÉDIATEMENT à la demande
 * (statut `paid` dès la création). Nouveau flux : la demande crée une ligne `pending` (aucun
 * débit) ; l'artiste ACCEPTE (débit + statut `paid`) ou REJETTE (statut `rejected`, aucun débit).
 * `paid_at` doit donc pouvoir être NULL tant que la demande est en attente ou rejetée — la
 * colonne était `NOT NULL` (héritée de l'ancien flux où elle était toujours posée à la création).
 * Réversible : `down` la remet `NOT NULL` (perd les lignes pending/rejected sans date : à éviter
 * en pratique, mais c'est le sens inverse attendu d'une migration de rollback).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('concert_dedications', 'paid_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('concert_dedications', 'paid_at', {
      type: Sequelize.DATE,
      allowNull: false,
    });
  },
};
