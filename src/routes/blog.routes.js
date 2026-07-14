import { Router } from 'express';
import Joi from 'joi';

import * as blogController from '../controllers/blog.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';

/**
 * @file Blog router — mounted at `/api/v1/blogs`.
 *
 * Public reads (published articles + view counter). Staff may list/read drafts.
 * Create, update and delete are admin-only.
 *
 * @module routes/blog.routes
 */

const uuid = Joi.string().uuid();
const idParam = { params: Joi.object({ id: uuid.required() }) };

const listQuery = {
  query: Joi.object({
    category: Joi.string().max(100),
    published: Joi.string().valid('true', 'false', 'all'),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

const createSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    content: Joi.string().min(1).required(),
    excerpt: Joi.string().max(4000).allow('', null),
    imageUrl: Joi.string().uri().max(2048).allow('', null),
    category: Joi.string().max(100),
    published: Joi.boolean(),
  }),
};

const updateSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    title: Joi.string().min(1).max(255),
    content: Joi.string().min(1),
    excerpt: Joi.string().max(4000).allow('', null),
    imageUrl: Joi.string().uri().max(2048).allow('', null),
    category: Joi.string().max(100),
    published: Joi.boolean(),
  }).min(1),
};

export const blogRouter = Router();

blogRouter.get('/', optionalAuth(), validate(listQuery), blogController.list);
blogRouter.post('/', authenticate(), requireRole('admin'), validate(createSchema), blogController.create);

blogRouter.get('/:id', optionalAuth(), validate(idParam), blogController.getOne);
blogRouter.patch('/:id', authenticate(), requireRole('admin'), validate(updateSchema), blogController.update);
blogRouter.delete('/:id', authenticate(), requireRole('admin'), validate(idParam), blogController.remove);

blogRouter.post('/:id/views', validate(idParam), blogController.view);

export default blogRouter;
