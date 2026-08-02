import * as recording from '../services/recording.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Recording (egress) control controllers.
 *
 * Let the event owner (host/manager) or staff LAUNCH / STOP a server-side
 * recording on demand — used when the admin sets that event type to `manual`.
 * The admin per-type mode (`recording_config`) is enforced in the service.
 *
 * @module controllers/recording.controller
 */

/** POST /recordings/start — the host/manager launches the recording. */
export async function start(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.startRecording({ sourceType, sourceId, createdBy: req.user.id, allowedModes: ['auto', 'manual'] });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** POST /recordings/stop — the host/manager stops the recording. */
export async function stop(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.stopRecording({ sourceType, sourceId });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** GET /recordings/status — mode + whether a recording is active (drives the host button). */
export async function status(req, res) {
  const { sourceType, sourceId } = req.query;
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

export default { start, stop, status };
