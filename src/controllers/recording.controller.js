import * as recording from '../services/recording.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Recording (egress) control controllers.
 *
 * Let the event owner (host/manager) or staff LAUNCH / PAUSE / RESUME / CANCEL / SAVE a
 * server-side recording on demand — used when the admin sets that event type to `manual`.
 * The admin per-type mode (`recording_config`) is enforced in the service. All manual actions
 * run in `strict` mode: a failure (not configured, nothing to act on, egress error) is
 * returned as a real error instead of a silent no-op.
 *
 * @module controllers/recording.controller
 */

/** POST /recordings/start — the host/manager launches the recording. */
export async function start(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.startRecording({ sourceType, sourceId, createdBy: req.user.id, allowedModes: ['auto', 'manual'], strict: true });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** POST /recordings/pause — pauses the current segment (LiveKit has no native pause: this stops it). */
export async function pause(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.pauseRecording({ sourceType, sourceId, strict: true });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** POST /recordings/resume — starts a new segment under the same session. */
export async function resume(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.resumeRecording({ sourceType, sourceId, strict: true });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** POST /recordings/cancel — discards the whole session, no replay is created. */
export async function cancel(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.cancelRecording({ sourceType, sourceId, strict: true });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** POST /recordings/stop — the host/manager saves the recording (segments are concatenated). */
export async function stop(req, res) {
  const { sourceType, sourceId } = req.body;
  await recording.assertEventOwner(sourceType, sourceId, req.user.id, req.roles);
  await recording.stopRecording({ sourceType, sourceId, strict: true });
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/** GET /recordings/status — mode + current session state (drives the host button + the timer). */
export async function status(req, res) {
  const { sourceType, sourceId } = req.query;
  return sendSuccess(res, await recording.recordingStatus(sourceType, sourceId));
}

/**
 * GET /recordings/live/:liveId/guests — polled by the headless recording-view page (no user
 * session) to keep its guest tiles in sync with who's currently accepted on the live. Gated by
 * `key`, not `authenticate()` — see `recording.service.js#liveRecordingKey`.
 */
export async function liveGuests(req, res) {
  const { liveId } = req.params;
  const { recordingId, key } = req.query;
  const guests = await recording.getLiveRecordingGuests({ liveId, recordingId, key });
  return sendSuccess(res, { guests });
}

export default { start, pause, resume, cancel, stop, status, liveGuests };
