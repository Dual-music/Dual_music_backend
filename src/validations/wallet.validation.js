import Joi from 'joi';

/**
 * @file Joi schemas for the wallet module.
 * @module validations/wallet.validation
 */

const uuid = Joi.string().uuid();

/** POST /wallet/vote */
export const voteSchema = {
  body: Joi.object({
    duelId: uuid.required(),
    artistId: uuid.required(),
    amount: Joi.number().integer().min(1).max(10000).required(),
  }),
};

/** POST /wallet/gifts/purchase */
export const purchaseGiftSchema = {
  body: Joi.object({
    giftId: uuid.required(),
    quantity: Joi.number().integer().min(1).max(100).required(),
  }),
};

/** POST /wallet/gifts/send */
export const sendGiftSchema = {
  body: Joi.object({
    giftId: uuid.required(),
    toUserId: uuid.required(),
    duelId: uuid.allow(null),
    liveId: uuid.allow(null),
    concertId: uuid.allow(null),
  }).or('duelId', 'liveId', 'concertId'),
};

/** POST /wallet/tickets/duel */
export const duelTicketSchema = { body: Joi.object({ duelId: uuid.required() }) };

/** POST /wallet/tickets/concert */
export const concertTicketSchema = { body: Joi.object({ concertId: uuid.required() }) };

/** POST /wallet/replays/unlock */
export const replayUnlockSchema = { body: Joi.object({ replayId: uuid.required() }) };

export const breakdownSchema = {
  query: Joi.object({ sourceId: uuid }),
};

export const revenuesSchema = {
  query: Joi.object({ since: Joi.date().iso() }),
};

export const eventTransactionsSchema = {
  query: Joi.object({
    sourceId: uuid.required(),
    limit: Joi.number().integer().min(1).max(100).default(25),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

export default {
  voteSchema,
  purchaseGiftSchema,
  sendGiftSchema,
  duelTicketSchema,
  concertTicketSchema,
  replayUnlockSchema,
};
