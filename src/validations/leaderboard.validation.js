import Joi from 'joi';

/**
 * @file Joi schemas for the leaderboards module.
 * @module validations/leaderboard.validation
 */

const uuid = Joi.string().uuid();

export const idParam = { params: Joi.object({ id: uuid.required() }) };
export const rankingQuery = {
  params: Joi.object({ id: uuid.required() }),
  query: Joi.object({ limit: Joi.number().integer().min(1).max(200) }),
};

export const giftEngagement = {
  query: Joi.object({
    contextType: Joi.string().valid('duel', 'concert', 'live', 'competition').required(),
    contextId: uuid.required(),
  }),
};

export const createSeason = {
  body: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    type: Joi.string().valid('artist', 'donor', 'fan').required(),
    start_date: Joi.date().iso().required(),
    end_date: Joi.date().iso().greater(Joi.ref('start_date')).required(),
    is_active: Joi.boolean(),
    is_mystery_reward: Joi.boolean(),
  }),
};

export const updateSeason = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    name: Joi.string().min(2).max(200),
    type: Joi.string().valid('artist', 'donor', 'fan'),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
    is_active: Joi.boolean(),
    is_mystery_reward: Joi.boolean(),
  }).min(1),
};

export const addReward = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    rank_position: Joi.number().integer().min(1).max(1000).required(),
    reward_type: Joi.string().valid('credits', 'virtual_gift', 'physical', 'mystery').default('credits'),
    credits_amount: Joi.number().min(0).allow(null),
    virtual_gift_id: uuid.allow(null),
    physical_description: Joi.string().max(1000).allow('', null),
  }),
};

export const updateReward = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    rank_position: Joi.number().integer().min(1).max(1000),
    reward_type: Joi.string().valid('credits', 'virtual_gift', 'physical', 'mystery'),
    credits_amount: Joi.number().min(0).allow(null),
    virtual_gift_id: uuid.allow(null),
    physical_description: Joi.string().max(1000).allow('', null),
  }).min(1),
};

export const createWinner = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    userId: uuid.required(),
    rankPosition: Joi.number().integer().min(1).required(),
    rewardStatus: Joi.string().max(40),
    meetingStatus: Joi.string().max(40),
    notes: Joi.string().max(2000).allow('', null),
  }),
};

export const updateWinner = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    reward_status: Joi.string().max(40),
    meeting_status: Joi.string().max(40),
    meeting_when: Joi.date().iso().allow(null),
    meeting_location: Joi.string().max(500).allow('', null),
    meeting_notes: Joi.string().max(2000).allow('', null),
    meeting_proposed_by: uuid.allow(null),
    notes: Joi.string().max(2000).allow('', null),
    distributed_at: Joi.date().iso().allow(null),
    received_at: Joi.date().iso().allow(null),
    notified_winner_at: Joi.date().iso().allow(null),
  }).min(1),
};

export const respondMeeting = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    meeting_status: Joi.string().valid('accepted', 'counter_proposed', 'declined').required(),
    counter_when: Joi.date().iso().allow(null),
    counter_location: Joi.string().max(500).allow('', null),
    counter_notes: Joi.string().max(2000).allow('', null),
    counter_proposed_at: Joi.date().iso().allow(null),
  }),
};

export default {
  idParam,
  rankingQuery,
  giftEngagement,
  createSeason,
  updateSeason,
  addReward,
  updateReward,
  createWinner,
  updateWinner,
  respondMeeting,
};
