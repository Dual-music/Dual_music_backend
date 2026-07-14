import { Router } from 'express';

import * as walletController from '../controllers/wallet.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { validate } from '../middlewares/validate.js';
import * as schemas from '../validations/wallet.validation.js';

/**
 * @file Wallet router — mounted at `/api/v1/wallet`. All routes require a Bearer
 * token. Debit routes are backed by atomic stored procedures, so double-purchase
 * of a ticket/replay is rejected server-side (`already_purchased`).
 *
 * | Method | Path | Body |
 * | --- | --- | --- |
 * | GET | / | — (balance) |
 * | GET | /revenues | — |
 * | GET | /revenues/breakdown | — |
 * | POST | /vote | duelId, artistId, amount |
 * | POST | /gifts/purchase | giftId, quantity |
 * | POST | /gifts/send | giftId, toUserId, (duelId|liveId|concertId) |
 * | POST | /tickets/duel | duelId |
 * | POST | /tickets/concert | concertId |
 * | POST | /replays/unlock | replayId |
 *
 * @module routes/wallet.routes
 */

export const walletRouter = Router();

walletRouter.use(authenticate());

walletRouter.get('/', walletController.getBalance);
walletRouter.get('/revenues', validate(schemas.revenuesSchema), walletController.getRevenues);
walletRouter.get('/spending', walletController.getSpending);
walletRouter.get('/revenues/breakdown', validate(schemas.breakdownSchema), walletController.getRevenueBreakdown);
walletRouter.get('/transactions', validate(schemas.eventTransactionsSchema), walletController.getEventTransactions);

walletRouter.post('/vote', validate(schemas.voteSchema), idempotency(), walletController.vote);
walletRouter.post('/gifts/purchase', validate(schemas.purchaseGiftSchema), idempotency(), walletController.purchaseGift);
walletRouter.post('/gifts/send', validate(schemas.sendGiftSchema), idempotency(), walletController.sendGift);
walletRouter.post('/tickets/duel', validate(schemas.duelTicketSchema), idempotency(), walletController.buyDuelTicket);
walletRouter.post('/tickets/concert', validate(schemas.concertTicketSchema), idempotency(), walletController.buyConcertTicket);
walletRouter.post('/replays/unlock', validate(schemas.replayUnlockSchema), idempotency(), walletController.unlockReplay);

export default walletRouter;
