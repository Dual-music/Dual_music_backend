import Joi from 'joi';

/**
 * @file Joi schemas for the moderation module.
 * @module validations/moderation.validation
 */

const uuid = Joi.string().uuid();
const reason = Joi.string().min(3).max(500).required();
const details = Joi.string().max(2000).allow('', null);

export const kindParam = { params: Joi.object({ kind: Joi.string().valid('account', 'live', 'competition').required() }) };

export const createAccountReport = {
  body: Joi.object({ reportedUserId: uuid.required(), reason, details }),
};
export const createLiveReport = {
  body: Joi.object({ liveId: uuid.required(), reason, details }),
};
export const createCompetitionReport = {
  body: Joi.object({ competitionId: uuid.required(), reason, details }),
};

export const listReports = {
  params: Joi.object({ kind: Joi.string().valid('account', 'live', 'competition').required() }),
  query: Joi.object({
    status: Joi.string().valid('pending', 'reviewed', 'resolved', 'dismissed'),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

export const reviewReport = {
  params: Joi.object({ kind: Joi.string().valid('account', 'live', 'competition').required(), id: uuid.required() }),
  body: Joi.object({ status: Joi.string().valid('reviewed', 'resolved', 'dismissed').required() }),
};

export const createStreamBan = {
  body: Joi.object({
    streamId: uuid.required(),
    streamType: Joi.string().valid('duel', 'live', 'concert', 'competition').required(),
    bannedUserId: uuid.required(),
    reason: Joi.string().max(500).allow('', null),
  }),
};
export const streamBanQuery = {
  query: Joi.object({
    streamId: uuid,
    streamType: Joi.string().valid('duel', 'live', 'concert', 'competition'),
  }),
};
export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const createCompetitionBan = {
  body: Joi.object({
    competitionId: uuid.required(),
    bannedUserId: uuid.required(),
    reason: Joi.string().max(500).allow('', null),
  }),
};
export const competitionBanQuery = { query: Joi.object({ competitionId: uuid }) };

export const warningsQuery = { query: Joi.object({}) };

export const platformBan = {
  body: Joi.object({
    userId: uuid.required(),
    reason: Joi.string().max(500).allow('', null),
    permanent: Joi.boolean().default(true),
    until: Joi.date().iso().allow(null),
  }),
};
export const platformUnban = { body: Joi.object({ userId: uuid.required() }) };

export const createWarning = {
  body: Joi.object({ userId: uuid.required(), message: Joi.string().min(3).max(1000).required() }),
};

export default {
  kindParam,
  createAccountReport,
  createLiveReport,
  createCompetitionReport,
  listReports,
  reviewReport,
  createStreamBan,
  streamBanQuery,
  idParam,
  createCompetitionBan,
  competitionBanQuery,
  warningsQuery,
  platformBan,
  platformUnban,
  createWarning,
};
