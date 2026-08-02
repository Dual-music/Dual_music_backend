import Joi from 'joi';

/**
 * @file Validation schemas for the recording (egress) control endpoints.
 * @module validations/recording.validation
 */

const target = Joi.object({
  sourceType: Joi.string().valid('live', 'duel', 'concert', 'competition').required(),
  sourceId: Joi.string().uuid().required(),
});

/** POST /recordings/start · /recordings/stop */
export const startStop = { body: target };

/** GET /recordings/status */
export const statusQuery = { query: target };

export default { startStop, statusQuery };
