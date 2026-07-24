import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Users/profiles HTTP controllers (thin).
 * @module controllers/user.controller
 */

/** POST /users/display-profiles */
export async function displayProfiles(req, res) {
  const rows = await userService.getDisplayProfiles(req.body.userIds);
  return sendSuccess(res, rows);
}

/** GET /users/:id */
export async function getProfile(req, res) {
  const data = await userService.getPublicProfile(req.params.id, req.user?.id ?? null);
  return sendSuccess(res, data);
}

/** PATCH /users/me */
export async function updateMe(req, res) {
  const profile = await userService.updateOwnProfile(req.user.id, req.body);
  return sendSuccess(res, profile);
}

/** GET /users/me/preferences */
export async function getPreferences(req, res) {
  const prefs = await userService.getPreferences(req.user.id);
  return sendSuccess(res, prefs);
}

/** GET /users/me/stats — profile-page stats (artist/manager/fan) + duels. */
export async function myStats(req, res) {
  return sendSuccess(res, await userService.getMyStats(req.user.id));
}

/** PUT /users/me/preferences/currency */
export async function setCurrency(req, res) {
  const result = await userService.setCurrency(req.user.id, req.body.currencyCode);
  return sendSuccess(res, result);
}

/** POST /users/:id/follow */
export async function follow(req, res) {
  const result = await userService.followArtist(req.user.id, req.params.id);
  return sendSuccess(res, result, { status: 201 });
}

/** DELETE /users/:id/follow */
export async function unfollow(req, res) {
  const result = await userService.unfollowArtist(req.user.id, req.params.id);
  return sendSuccess(res, result);
}

/** GET /users/me/following */
export async function myFollowing(req, res) {
  const ids = await userService.getFollowedArtistIds(req.user.id);
  return sendSuccess(res, ids);
}

/** GET /users/:id/badges (public) */
export async function badges(req, res) {
  return sendSuccess(res, await userService.getUserBadges(req.params.id));
}

/** GET /users/me/ui-preferences (auth) */
export async function getUiPreferences(req, res) {
  return sendSuccess(res, await userService.getUiPreferences(req.user.id));
}

/** PUT /users/me/ui-preferences (auth) */
export async function setUiPreferences(req, res) {
  return sendSuccess(res, await userService.setUiPreferences(req.user.id, req.body));
}

/** POST /users/me/deletion — programme la suppression du compte (grâce 20 jours). */
export async function requestDeletion(req, res) {
  return sendSuccess(res, await userService.requestAccountDeletion(req.user.id));
}

/** DELETE /users/me/deletion — annule la suppression programmée. */
export async function cancelDeletion(req, res) {
  return sendSuccess(res, await userService.cancelAccountDeletion(req.user.id));
}

export default {
  displayProfiles,
  getProfile,
  updateMe,
  getPreferences,
  myStats,
  setCurrency,
  follow,
  unfollow,
  myFollowing,
  badges,
  getUiPreferences,
  setUiPreferences,
  requestDeletion,
  cancelDeletion,
};
