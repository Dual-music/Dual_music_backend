/* eslint-disable */
'use strict';

/**
 * Migration 0012 — corrige la clé primaire de `live_likes`.
 *
 * BUG D'ORIGINE : la table `live_likes` avait `likes_count` comme **clé primaire**
 * (héritée d'une mauvaise génération depuis le schéma Supabase). Or `incrementLikes`
 * fait un `INSERT ... ON DUPLICATE KEY UPDATE` censé cibler UNE ligne par direct
 * (`live_id`). Avec la PK sur `likes_count`, l'`ON DUPLICATE` collisionnait entre
 * directs DIFFÉRENTS partageant la même valeur de compteur : la ligne du direct
 * concerné n'était souvent jamais créée → `GET /lives/:id/likes` renvoyait 0 et le
 * nombre de j'aime « repartait à zéro » à chaque retour sur le direct/duel.
 *
 * CORRECTIF : reconstruire la table avec `live_id` comme **clé primaire** (un
 * compteur par direct), en consolidant les données existantes (max par `live_id`).
 * Réversible (le `down` restaure l'ancien schéma cassé, à titre de complétude).
 */
module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    // 1) Table cible propre : 1 ligne par direct, PK = live_id.
    await sequelize.query(`
      CREATE TABLE live_likes_fixed (
        live_id CHAR(36) NOT NULL PRIMARY KEY,
        likes_count INT NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
    `);
    // 2) Consolider l'existant : on garde le compteur MAX connu par direct.
    await sequelize.query(`
      INSERT INTO live_likes_fixed (live_id, likes_count, updated_at)
      SELECT live_id, MAX(likes_count), MAX(updated_at)
      FROM live_likes
      GROUP BY live_id
    `);
    // 3) Remplacer l'ancienne table par la nouvelle.
    await sequelize.query('DROP TABLE live_likes');
    await sequelize.query('RENAME TABLE live_likes_fixed TO live_likes');
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    // Restaure l'ancien schéma (PK sur likes_count). On dé-duplique par likes_count
    // pour que l'ajout de PK ne casse pas (l'ancien schéma était de toute façon buggé).
    await sequelize.query(`
      CREATE TABLE live_likes_old (
        likes_count INT NOT NULL PRIMARY KEY,
        live_id CHAR(36) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX live_likes_live_id (live_id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
    `);
    await sequelize.query(`
      INSERT INTO live_likes_old (likes_count, live_id, updated_at)
      SELECT likes_count, MAX(live_id), MAX(updated_at)
      FROM live_likes
      GROUP BY likes_count
    `);
    await sequelize.query('DROP TABLE live_likes');
    await sequelize.query('RENAME TABLE live_likes_old TO live_likes');
  },
};
