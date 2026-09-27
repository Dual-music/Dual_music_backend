/* eslint-disable */
'use strict';

/**
 * Migration 0019 — support pause/reprise sur l'enregistrement (egress LiveKit n'a pas de
 * vraie pause serveur : on enchaîne plusieurs segments (start/stop d'egress successifs) sous
 * UNE session `stream_recordings`, puis on les recolle en une seule vidéo (ffmpeg) à la
 * sauvegarde finale.
 *
 * - `segments`            : JSON, liste ordonnée des segments de CETTE session
 *   (`[{ seq, egressId, filePath, status, durationSeconds }]`) — status parmi
 *   'active' | 'completed' | 'failed'.
 * - `accumulated_seconds` : durée cumulée des segments déjà terminés (mise à jour au moment
 *   de la pause / de la sauvegarde finale, sans attendre le webhook egress_ended — le webhook
 *   sert seulement à corriger `segments[i].durationSeconds` a posteriori).
 * - `run_started_at`      : horodatage de démarrage du segment EN COURS (null si en pause /
 *   pas encore démarré / terminé) — permet au client de calculer un chrono qui continue de
 *   tourner localement entre deux polls de `GET /recordings/status`.
 * - `final_file_path`     : clé de stockage déterministe du fichier FINAL (recollé), connue
 *   dès la création de la session — même logique que `file_path` existant, qui continue lui
 *   de désigner le segment le plus récent.
 *
 * `status` reste une colonne texte libre (pas d'ENUM) : les nouvelles valeurs 'paused',
 * 'concatenating' et 'cancelled' s'ajoutent sans changement de schéma.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('stream_recordings', 'segments', { type: Sequelize.JSON, allowNull: true });
    await queryInterface.addColumn('stream_recordings', 'accumulated_seconds', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('stream_recordings', 'run_started_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('stream_recordings', 'final_file_path', { type: Sequelize.STRING(2048), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('stream_recordings', 'final_file_path');
    await queryInterface.removeColumn('stream_recordings', 'run_started_at');
    await queryInterface.removeColumn('stream_recordings', 'accumulated_seconds');
    await queryInterface.removeColumn('stream_recordings', 'segments');
  },
};
