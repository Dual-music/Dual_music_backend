import Joi from 'joi';

/**
 * @file Joi schemas for the admin module.
 * @module validations/admin.validation
 */

const uuid = Joi.string().uuid();
const role = Joi.string().valid('fan', 'artist', 'manager', 'moderator', 'admin');

export const listLogs = {
  query: Joi.object({
    actionType: Joi.string().max(60),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

export const userIdParam = { params: Joi.object({ userId: uuid.required() }) };

export const assignRole = { body: Joi.object({ userId: uuid.required(), role: role.required() }) };
export const revokeRole = { body: Joi.object({ userId: uuid.required(), role: role.required() }) };
export const rolesBatch = { body: Joi.object({ userIds: Joi.array().items(uuid).max(500).required() }) };

export const searchUsers = { query: Joi.object({ q: Joi.string().min(1).max(200).required() }) };
export const listDedications = { query: Joi.object({ limit: Joi.number().integer().min(1).max(200) }) };

export const keyParam = { params: Joi.object({ key: Joi.string().min(1).max(120).required() }) };
export const upsertSetting = {
  params: Joi.object({ key: Joi.string().min(1).max(120).required() }),
  body: Joi.object({ value: Joi.any().required() }),
};

const period = Joi.string().valid('day', 'week', 'month', 'all');
export const analyticsQuery = { query: Joi.object({ period }) };
export const topEarnersQuery = {
  query: Joi.object({ period, limit: Joi.number().integer().min(1).max(100) }),
};
export const distributionParam = { params: Joi.object({ id: uuid.required() }) };
export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const ledgerQuery = { query: Joi.object({ limit: Joi.number().integer().min(1).max(500) }) };
export const revenueDistributionsQuery = {
  query: Joi.object({ sourceType: Joi.string().max(60), limit: Joi.number().integer().min(1).max(200) }),
};
export const writeLog = {
  body: Joi.object({
    actionType: Joi.string().min(1).max(60).required(),
    targetType: Joi.string().max(60).allow(null, ''),
    targetId: Joi.string().max(200).allow(null, ''),
    targetName: Joi.string().max(200).allow(null, ''),
    details: Joi.object().allow(null),
  }),
};

export const approveDuelRequest = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    managerId: uuid.allow(null),
    scheduledDate: Joi.date().iso().allow(null),
    ticketPrice: Joi.number().min(0),
    allowsSponsorAds: Joi.boolean(),
  }),
};
export const rejectDuelRequest = { params: Joi.object({ id: uuid.required() }) };
export const announcement = {
  body: Joi.object({
    title: Joi.string().min(2).max(200).required(),
    message: Joi.string().min(2).max(2000).required(),
    type: Joi.string().max(40),
  }),
};

export default {
  listLogs,
  userIdParam,
  assignRole,
  revokeRole,
  rolesBatch,
  searchUsers,
  listDedications,
  keyParam,
  upsertSetting,
  analyticsQuery,
  topEarnersQuery,
  distributionParam,
  idParam,
  ledgerQuery,
  revenueDistributionsQuery,
  writeLog,
  approveDuelRequest,
  rejectDuelRequest,
  announcement,
};
