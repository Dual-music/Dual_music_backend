/* eslint-disable */
'use strict';

/**
 * Migration 0011 — date de naissance + sexe du profil.
 * Ajoute `birth_date` (DATEONLY) et `gender` (STRING) sur `profiles`, saisis lors de la
 * complétion du profil à l'inscription. Nullable (rétro-compatible). Réversible.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('profiles', 'birth_date', { type: Sequelize.DATEONLY, allowNull: true });
    await queryInterface.addColumn('profiles', 'gender', { type: Sequelize.STRING, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('profiles', 'birth_date');
    await queryInterface.removeColumn('profiles', 'gender');
  },
};
