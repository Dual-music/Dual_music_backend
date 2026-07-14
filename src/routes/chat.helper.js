import Joi from 'joi';

import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as chatService from '../services/chat.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Attaches a standard threaded-chat sub-resource to an event router.
 *
 * Adds, for a given event type:
 *   - GET    /:id/messages         (public, paginated, author-hydrated)
 *   - POST   /:id/messages         (Bearer — post / reply)
 *   - DELETE /:id/messages/:msgId  (Bearer — author or moderator hides it)
 *
 * @module routes/chat.helper
 */

const postSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({
    message: Joi.string().min(1).max(2000).required(),
    parentId: Joi.string().uuid().allow(null),
  }),
};

/**
 * @param {import('express').Router} router
 * @param {'duel'|'concert'|'competition'|'live'} bindingKey
 * @returns {import('express').Router} The same router (chainable).
 */
export function attachChatRoutes(router, bindingKey) {
  const binding = chatService.CHAT_BINDINGS[bindingKey];

  router.get('/:id/messages', optionalAuth(), async (req, res) => {
    const { rows, pagination } = await chatService.listMessages(binding, req.params.id, req.query);
    return sendSuccess(res, rows, { pagination });
  });

  router.post('/:id/messages', authenticate(), validate(postSchema), async (req, res) => {
    const msg = await chatService.postMessage(binding, {
      eventId: req.params.id,
      userId: req.user.id,
      message: req.body.message,
      parentId: req.body.parentId,
    });
    return sendSuccess(res, msg, { status: 201 });
  });

  router.delete('/:id/messages/:msgId', authenticate(), async (req, res) => {
    await chatService.moderateMessage(binding, req.params.msgId, req.user, req.roles);
    return sendSuccess(res, { moderated: true });
  });

  return router;
}

export default attachChatRoutes;
