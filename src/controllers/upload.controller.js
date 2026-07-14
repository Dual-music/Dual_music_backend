import * as uploadService from '../services/upload.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Uploads HTTP controllers (thin).
 * @module controllers/upload.controller
 */

/** POST /uploads/presign — issue a presigned PUT URL. */
export async function presign(req, res) {
  const result = await uploadService.presignUpload({ userId: req.user.id, ...req.body });
  return sendSuccess(res, result, { status: 201 });
}

/** POST /uploads/presign-download — issue a presigned GET URL for a private object. */
export async function presignDownload(req, res) {
  return sendSuccess(res, await uploadService.presignDownload(req.body.key));
}

/** POST /uploads/confirm — validate magic bytes + scan a completed upload. */
export async function confirm(req, res) {
  return sendSuccess(res, await uploadService.confirmUpload(req.user.id, req.body.key));
}

export default { presign, presignDownload, confirm };
