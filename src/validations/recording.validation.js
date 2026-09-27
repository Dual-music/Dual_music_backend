import Joi from 'joi';

/**
 * @file Validation schemas for the recording (egress) control endpoints.
 * @module validations/recording.validation
 */

const target = Joi.object({
  sourceType: Joi.string().valid('live', 'duel', 'concert', 'competition').required(),
  sourceId: Joi.string().uuid().required(),
});

/** POST /recordings/start · /stop · /pause · /resume · /cancel */
export const startStop = { body: target };

/** GET /recordings/status */
export const statusQuery = { query: target };

/**
 * GET /recordings/live/:liveId/guests — appelée par la page « vue enregistrement » headless
 * (pas d'auth utilisateur), protégée par `key` (voir `recording.service.js#liveRecordingKey`).
 */
export const liveGuestsQuery = {
  params: Joi.object({ liveId: Joi.string().uuid().required() }),
  query: Joi.object({
    recordingId: Joi.string().uuid().required(),
    key: Joi.string().length(32).required(),
  }),
};

export default { startStop, statusQuery, liveGuestsQuery };
