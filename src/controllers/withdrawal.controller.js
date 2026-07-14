import * as withdrawalService from '../services/withdrawal.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Withdrawals HTTP controllers (thin).
 * @module controllers/withdrawal.controller
 */

/** GET /withdrawals/pin */
export async function hasPin(req, res) {
  return sendSuccess(res, await withdrawalService.hasPin(req.user.id));
}

/** POST /withdrawals/pin */
export async function setPin(req, res) {
  return sendSuccess(res, await withdrawalService.setPin(req.user.id, req.body.newPin, req.body.currentPin));
}

/** POST /withdrawals/pin/verify */
export async function verifyPin(req, res) {
  return sendSuccess(res, await withdrawalService.verifyPin(req.user.id, req.body.pin));
}

/** POST /withdrawals/pin/reset/request */
export async function requestPinReset(req, res) {
  return sendSuccess(res, await withdrawalService.requestPinReset(req.user.id));
}

/** POST /withdrawals/pin/reset/confirm */
export async function confirmPinReset(req, res) {
  return sendSuccess(res, await withdrawalService.confirmPinReset(req.user.id, req.body.otp, req.body.newPin));
}

/** POST /withdrawals/net */
export async function calculateNet(req, res) {
  return sendSuccess(res, await withdrawalService.calculateNet(req.user.id, req.body.amount));
}

/** POST /withdrawals */
export async function request(req, res) {
  return sendSuccess(res, await withdrawalService.requestWithdrawal(req.user.id, req.body), { status: 201 });
}

/** GET /withdrawals/me */
export async function myWithdrawals(req, res) {
  const { rows, pagination } = await withdrawalService.listMine(req.user.id, req.query);
  return sendSuccess(res, rows, { pagination });
}

/** GET /withdrawals (admin) */
export async function listAll(req, res) {
  const { rows, pagination } = await withdrawalService.listAll(req.query);
  return sendSuccess(res, rows, { pagination });
}

/** POST /withdrawals/:id/approve (admin) */
export async function approve(req, res) {
  return sendSuccess(res, await withdrawalService.approve(req.params.id, req.user.id));
}

/** POST /withdrawals/:id/reject (admin) */
export async function reject(req, res) {
  return sendSuccess(res, await withdrawalService.reject(req.params.id, req.user.id));
}

/** POST /withdrawals/:id/complete (admin) */
export async function complete(req, res) {
  return sendSuccess(res, await withdrawalService.complete(req.params.id, req.user.id, req.body.providerTxId));
}

/** GET /withdrawals/methods */
export async function listMethods(req, res) {
  return sendSuccess(res, await withdrawalService.listMethods(req.user.id));
}

/** POST /withdrawals/methods */
export async function addMethod(req, res) {
  return sendSuccess(res, await withdrawalService.addMethod(req.user.id, req.body), { status: 201 });
}

/** PATCH /withdrawals/methods/:id */
export async function updateMethod(req, res) {
  return sendSuccess(res, await withdrawalService.updateMethod(req.user.id, req.params.id, req.body));
}

/** DELETE /withdrawals/methods/:id */
export async function deleteMethod(req, res) {
  return sendSuccess(res, await withdrawalService.deleteMethod(req.user.id, req.params.id));
}

export default {
  hasPin,
  setPin,
  verifyPin,
  requestPinReset,
  confirmPinReset,
  calculateNet,
  request,
  myWithdrawals,
  listAll,
  approve,
  reject,
  complete,
  listMethods,
  addMethod,
  updateMethod,
  deleteMethod,
};
