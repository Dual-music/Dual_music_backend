import * as notificationService from '../services/notification.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Notifications HTTP controllers (thin).
 * @module controllers/notification.controller
 */

/** GET /notifications */
export async function list(req, res) {
  const { rows, pagination } = await notificationService.listNotifications(req.user.id, req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /notifications/unread-count */
export async function unreadCount(req, res) {
  return sendSuccess(res, await notificationService.unreadCount(req.user.id));
}

/** POST /notifications/:id/read */
export async function markRead(req, res) {
  return sendSuccess(res, await notificationService.markRead(req.user.id, req.params.id));
}

/** POST /notifications/read-all */
export async function markAllRead(req, res) {
  return sendSuccess(res, await notificationService.markAllRead(req.user.id));
}

/** DELETE /notifications/:id */
export async function remove(req, res) {
  return sendSuccess(res, await notificationService.remove(req.user.id, req.params.id));
}

/** GET /notifications/preferences — flags à plat (web + mobile les lisent à plat). */
export async function getPreferences(req, res) {
  return sendSuccess(res, await notificationService.getEmailPreferences(req.user.id));
}

/** PUT /notifications/preferences/email */
export async function updateEmailPreferences(req, res) {
  return sendSuccess(res, await notificationService.updateEmailPreferences(req.user.id, req.body));
}

/** POST /notifications/push/subscribe */
export async function subscribePush(req, res) {
  return sendSuccess(res, await notificationService.subscribePush(req.user.id, req.body), { status: 201 });
}

/** DELETE /notifications/push/subscribe */
export async function unsubscribePush(req, res) {
  return sendSuccess(res, await notificationService.unsubscribePush(req.user.id, req.body.endpoint));
}

/** POST /notifications/devices — enregistre un jeton FCM (mobile). */
export async function registerDevice(req, res) {
  return sendSuccess(res, await notificationService.registerFcmToken(req.user.id, req.body.token), { status: 201 });
}

/** DELETE /notifications/devices — supprime un jeton FCM. */
export async function unregisterDevice(req, res) {
  return sendSuccess(res, await notificationService.unregisterFcmToken(req.user.id, req.body.token));
}

export default {
  list,
  unreadCount,
  markRead,
  markAllRead,
  remove,
  getPreferences,
  updateEmailPreferences,
  subscribePush,
  unsubscribePush,
  registerDevice,
  unregisterDevice,
};
