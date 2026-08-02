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
