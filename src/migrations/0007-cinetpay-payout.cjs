/* eslint-disable */
'use strict';

/**
 * Migration 0007 — intégrité et performance de la table des transactions CinetPay,
 * requises par le transfert (PayOut).
 *
 *  - **Unicité de `merchant_transaction_id`** (CinetPay + Moneroo). Toute
 *    l'idempotence des webhooks et des procédures repose sur cet identifiant :
 *    sans contrainte, deux livraisons concurrentes peuvent insérer deux lignes
 *    et créditer/rembourser deux fois. C'est le garde-fou de dernier recours,
 *    au niveau du moteur.
 *  - **Index `(kind, status, created_at)`** : le job de réconciliation balaie les
 *    transactions `pending` toutes les 3 minutes ; sans index il finit en scan
 *    complet dès que le ledger grossit.
 *  - **Index `withdrawal_requests(status)`** : file d'attente admin + relance des
 *    retraits bloqués en `processing`.
 *
 * Reversible : `down` supprime les index ajoutés.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('cinetpay_transactions', ['merchant_transaction_id'], {
      unique: true,
      name: 'uq_cinetpay_merchant_tx',
    });
    await queryInterface.addIndex('cinetpay_transactions', ['kind', 'status', 'created_at'], {
      name: 'idx_cinetpay_kind_status_created',
    });
    await queryInterface.addIndex('moneroo_transactions', ['merchant_transaction_id'], {
      unique: true,
      name: 'uq_moneroo_merchant_tx',
    });
    await queryInterface.addIndex('withdrawal_requests', ['status'], {
      name: 'idx_withdrawal_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('cinetpay_transactions', 'uq_cinetpay_merchant_tx');
    await queryInterface.removeIndex('cinetpay_transactions', 'idx_cinetpay_kind_status_created');
    await queryInterface.removeIndex('moneroo_transactions', 'uq_moneroo_merchant_tx');
    await queryInterface.removeIndex('withdrawal_requests', 'idx_withdrawal_status');
  },
};
