import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `stream_attendance`.
 * Journal de présence réelle sur un direct (rempli à la connexion Socket.IO, voir
 * `realtime/index.js`) — sert à accorder gratuitement un replay payant à qui a suivi le direct
 * (voir `replay.service.js#computeAccess`).
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineStreamAttendance(sequelize) {
  return sequelize.define(
    'StreamAttendance',
    {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // 'live' | 'concert' | 'duel' | 'competition'.
    event_type: { type: DataTypes.STRING, allowNull: false },
    event_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'stream_attendance',
      timestamps: false,
      underscored: true,
    },
  );
}
