import { applyGeneratedAssociations } from './associations.generated.js';

/**
 * @file Wires all model associations.
 *
 * Runs the generated `belongsTo` graph first (one per foreign key), then layers
 * hand-authored relations that the generator intentionally leaves out:
 *  - the `User` 1:1/1:N reverse relations (profile, roles, wallet, …);
 *  - reverse `hasMany` for hot read paths (a duel's votes/messages/gifts, …).
 *
 * @module models/associations
 */

/**
 * @param {Record<string, import('sequelize').ModelStatic<any>>} m - Model registry.
 */
export function applyAssociations(m) {
  applyGeneratedAssociations(m);

  // --- Identity: user id == profile id (shared primary key) -----------------
  m.User.hasOne(m.Profile, { as: 'profile', foreignKey: 'id', sourceKey: 'id' });
  m.Profile.belongsTo(m.User, { as: 'account', foreignKey: 'id', targetKey: 'id' });

  m.User.hasMany(m.UserRole, { as: 'roles', foreignKey: 'user_id' });
  m.User.hasMany(m.RefreshToken, { as: 'refreshTokens', foreignKey: 'user_id' });
  m.User.hasMany(m.OAuthAccount, { as: 'oauthAccounts', foreignKey: 'user_id' });
  m.User.hasOne(m.UserWallet, { as: 'wallet', foreignKey: 'user_id' });
  m.User.hasOne(m.ArtistProfile, { as: 'artistProfile', foreignKey: 'user_id' });
  m.User.hasOne(m.ManagerProfile, { as: 'managerProfile', foreignKey: 'user_id' });
  m.RefreshToken.belongsTo(m.User, { as: 'user', foreignKey: 'user_id' });
  m.OAuthAccount.belongsTo(m.User, { as: 'user', foreignKey: 'user_id' });

  // --- Duels ----------------------------------------------------------------
  m.Duel.hasMany(m.DuelVote, { as: 'votes', foreignKey: 'duel_id' });
  m.Duel.hasMany(m.DuelChatMessage, { as: 'messages', foreignKey: 'duel_id' });
  m.Duel.hasMany(m.GiftTransaction, { as: 'gifts', foreignKey: 'duel_id' });
  m.Duel.hasMany(m.DuelTicket, { as: 'tickets', foreignKey: 'duel_id' });

  // --- Concerts -------------------------------------------------------------
  m.Concert.hasMany(m.ConcertTicket, { as: 'tickets', foreignKey: 'concert_id' });
  m.Concert.hasMany(m.ConcertChatMessage, { as: 'messages', foreignKey: 'concert_id' });
  m.Concert.hasMany(m.ConcertDedication, { as: 'dedications', foreignKey: 'concert_id' });

  // --- Competitions ---------------------------------------------------------
  m.Competition.hasMany(m.CompetitionCandidate, { as: 'candidates', foreignKey: 'competition_id' });
  m.Competition.hasMany(m.CompetitionVote, { as: 'votes', foreignKey: 'competition_id' });
  m.Competition.hasMany(m.CompetitionTicket, { as: 'tickets', foreignKey: 'competition_id' });
  m.Competition.hasMany(m.CompetitionChatMessage, { as: 'messages', foreignKey: 'competition_id' });

  // --- Lives ----------------------------------------------------------------
  m.ArtistLive.hasMany(m.LiveChatMessage, { as: 'messages', foreignKey: 'live_id' });

  // --- Comments -------------------------------------------------------------
  m.Comment.hasMany(m.CommentLike, { as: 'likes', foreignKey: 'comment_id' });
}

export default applyAssociations;
