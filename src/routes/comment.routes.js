import { Router } from 'express';
import Joi from 'joi';

import * as commentController from '../controllers/comment.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { CONTENT_TYPES } from '../services/comment.service.js';

/**
 * @file Comments router — mounted at `/api/v1/comments`.
 *
 * Public read of a target's comment thread. Authenticated users create their own
 * comments, like/unlike, and delete their own (staff may delete any).
 *
 * @module routes/comment.routes
 */

const uuid = Joi.string().uuid();
const idParam = { params: Joi.object({ id: uuid.required() }) };
const contentType = Joi.string().valid(...CONTENT_TYPES);

const listQuery = {
  query: Joi.object({
    contentType: contentType.required(),
    contentId: uuid.required(),
  }),
};

const createSchema = {
  body: Joi.object({
    contentType: contentType.required(),
    contentId: uuid.required(),
    content: Joi.string().min(1).max(4000).required(),
    parentId: uuid.allow(null),
  }),
};

export const commentRouter = Router();

commentRouter.get('/', optionalAuth(), validate(listQuery), commentController.list);
commentRouter.post('/', authenticate(), validate(createSchema), commentController.create);

commentRouter.delete('/:id', authenticate(), validate(idParam), commentController.remove);
commentRouter.post('/:id/likes', authenticate(), validate(idParam), commentController.toggleLike);

export default commentRouter;
