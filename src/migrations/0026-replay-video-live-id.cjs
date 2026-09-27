/* eslint-disable */
'use strict';

/**
 * Migration 0026 — `replay_videos.live_id` : `SOURCE_FK` (replay.service.js) ne mappait
 * `sourceType` que pour duel/concert/competition — un replay issu d'un LIVE (`source_type:
 * 'live'`, produit par `recording.service.js#concatenateSession`) n'avait aucune colonne pour
 * stocker l'id du live d'origine, ce qui faisait échouer `createReplay` avec `VALIDATION_ERROR`
 * (avalé en `status: 'failed'` côté enregistrement — un live ne produisait donc jamais de replay).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('replay_videos', 'live_id', { type: Sequelize.UUID, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('replay_videos', 'live_id');
  },
};
