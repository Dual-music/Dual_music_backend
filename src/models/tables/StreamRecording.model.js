import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `stream_recordings`.
 *
 * Tracks a LiveKit Egress recording of a live room and correlates the async
 * egress lifecycle (webhook) back to the event so a `replay_videos` row can be
 * created when the recording finishes. One row per go-live of a duel / concert /
 * competition / live.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineStreamRecording(sequelize) {
  return sequelize.define(
    'StreamRecording',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
      // Egress job id (LiveKit). Null between the DB insert and the API call succeeding.
      egress_id: { type: DataTypes.STRING, allowNull: true },
      room_name: { type: DataTypes.STRING, allowNull: false },
      // 'duel' | 'concert' | 'competition' | 'live' (matches replay_videos.source_type).
      source_type: { type: DataTypes.STRING, allowNull: false },
      source_id: { type: DataTypes.UUID, allowNull: false },
      artist_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      // Deterministic object key we told egress to write to (so the public URL is
      // known without parsing the webhook's location field).
      file_path: { type: DataTypes.STRING(2048), allowNull: false },
      // 'pending' | 'active' | 'completed' | 'failed' | 'stopped'
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
      // Replay row created on completion (webhook egress_ended).
      replay_id: { type: DataTypes.UUID, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: true },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // Pause/reprise (pas de pause native côté egress LiveKit) : segments successifs de cette
      // session — `[{ seq, egressId, filePath, status, durationSeconds }]`.
      segments: { type: DataTypes.JSON, allowNull: true },
      // Durée cumulée des segments déjà clos (secondes) ; `run_started_at` (si non null) porte
      // le temps du segment EN COURS, à additionner côté client pour le chrono live.
      accumulated_seconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      run_started_at: { type: DataTypes.DATE, allowNull: true },
      // Clé de stockage du fichier final (recollé si >1 segment), connue dès la création.
      final_file_path: { type: DataTypes.STRING(2048), allowNull: true },
    },
    {
      tableName: 'stream_recordings',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true,
    },
  );
}
