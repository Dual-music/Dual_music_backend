import { Router } from 'express';

import * as moderationController from '../controllers/moderation.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/moderation.validation.js';

/**
 * @file Moderation router — mounted at `/api/v1/moderation`.
 *
 * Reporting is open to any authenticated user; review & bans require
 * `moderator`/`admin` (platform bans: `admin` only). Per-event bans additionally
 * accept the event owner roles (`manager`/`artist`) at the stream level.
 *
 * @module routes/moderation.routes
 */

export const moderationRouter = Router();

// --- Reports (any authenticated user can file) -------------------------------
moderationRouter.post('/reports/account', authenticate(), validate(v.createAccountReport), moderationController.reportAccount);
moderationRouter.post('/reports/live', authenticate(), validate(v.createLiveReport), moderationController.reportLive);
moderationRouter.post('/reports/competition', authenticate(), validate(v.createCompetitionReport), moderationController.reportCompetition);

// --- Report queue (moderator/admin) ------------------------------------------
// Static `/reports/account/aggregate` must precede the dynamic `/reports/:kind`.
moderationRouter.get('/reports/account/aggregate', authenticate(), requireRole('admin'), moderationController.aggregateAccountReports);
moderationRouter.get('/reports/:kind', authenticate(), requireRole('moderator', 'admin'), validate(v.listReports), moderationController.listReports);
moderationRouter.patch('/reports/:kind/:id', authenticate(), requireRole('moderator', 'admin'), validate(v.reviewReport), moderationController.reviewReport);

// --- Stream bans (event host, its appointed moderators, or platform moderators/admins) -------
// Pas de `requireRole` ici : depuis l'ajout des modérateurs désignés (voir moderation.service.js
// #canModerateEvent), l'autorisation n'est plus un rôle global (un simple fan nommé modérateur
// d'un live doit pouvoir bannir) — elle est vérifiée par évènement, côté service.
moderationRouter.get('/stream-bans', authenticate(), validate(v.streamBanQuery), moderationController.listStreamBans);
moderationRouter.post('/stream-bans', authenticate(), validate(v.createStreamBan), moderationController.banStream);
moderationRouter.delete('/stream-bans/:id', authenticate(), validate(v.idParam), moderationController.liftStreamBan);

// --- Competition bans (competition host, its appointed moderators, or platform moderators/admins) --
// GET ouvert à tout utilisateur authentifié (comme /stream-bans) : un spectateur/candidat doit
// pouvoir vérifier SON PROPRE statut de bannissement (useStreamBan côté web) — restreindre à
// `admin` empêchait quiconque d'autre de charger la liste, `isCurrentUserBanned` restait donc
// toujours faux pour les managers/spectateurs/candidats (bug constaté en développant le
// bannissement des candidats).
moderationRouter.get('/competition-bans', authenticate(), validate(v.competitionBanQuery), moderationController.listCompetitionBans);
moderationRouter.post('/competition-bans', authenticate(), validate(v.createCompetitionBan), moderationController.banCompetition);
moderationRouter.delete('/competition-bans/:id', authenticate(), validate(v.idParam), moderationController.liftCompetitionBan);

// --- Event moderators (host-appointed, up to 2 per event) --------------------
moderationRouter.get('/events/:type/:id/viewers', authenticate(), validate(v.eventParam), moderationController.listCurrentViewers);
moderationRouter.get('/events/:type/:id/moderators', authenticate(), validate(v.eventParam), moderationController.listEventModerators);
moderationRouter.post('/events/:type/:id/moderators', authenticate(), validate(v.appointModerator), moderationController.appointModerator);
moderationRouter.delete('/events/:type/:id/moderators/:userId', authenticate(), validate(v.revokeModerator), moderationController.revokeModerator);

// --- Platform bans (admin only) ----------------------------------------------
moderationRouter.get('/platform-bans', authenticate(), requireRole('admin'), moderationController.listPlatformBans);
moderationRouter.post('/platform-bans', authenticate(), requireRole('admin'), validate(v.platformBan), moderationController.banPlatform);
moderationRouter.delete('/platform-bans', authenticate(), requireRole('admin'), validate(v.platformUnban), moderationController.unbanPlatform);

// --- Warnings ----------------------------------------------------------------
moderationRouter.get('/warnings/me', authenticate(), moderationController.myWarnings);
moderationRouter.get('/warnings', authenticate(), requireRole('admin'), validate(v.warningsQuery), moderationController.listWarnings);
moderationRouter.post('/warnings', authenticate(), requireRole('moderator', 'admin'), validate(v.createWarning), moderationController.issueWarning);

export default moderationRouter;
