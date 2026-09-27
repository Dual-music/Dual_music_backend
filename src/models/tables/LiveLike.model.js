import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for `live_likes`.
 *
 * ⚠️ La PK est `live_id` (UN compteur par direct) — voir migration 0012. Le schéma
 * généré à l'origine mettait par erreur la PK sur `likes_count`, ce qui cassait
 * `incrementLikes` (collisions entre directs de même compteur) → j'aime qui repartaient
 * à zéro. Ne pas régénérer ce modèle sans conserver `live_id` comme clé primaire.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function defineLiveLike(sequelize) {
  return sequelize.define(
    'LiveLike',
    {
    live_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    likes_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'live_likes',
      timestamps: false,
      underscored: true,
    },
  );
}
