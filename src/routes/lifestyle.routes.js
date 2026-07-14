import { Router } from 'express';
import Joi from 'joi';

import * as lifestyleController from '../controllers/lifestyle.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';

/**
 * @file Lifestyle videos router — mounted at `/api/v1/lifestyle`.
 *
 * Public reads (list, detail, view counter). Authenticated: like toggle.
 * Artists (or admin) create; owner/staff edit & delete.
 *
 * @module routes/lifestyle.routes
 */

const uuid = Joi.string().uuid();
const idParam = { params: Joi.object({ id: uuid.required() }) };

const listQuery = {
  query: Joi.object({
    artistId: uuid,
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

const createSchema = {
  body: Joi.object({
    artistName: Joi.string().max(255).required(),
    title: Joi.string().min(1).max(255).required(),
    videoUrl: Joi.string().uri().max(2048).required(),
    thumbnailUrl: Joi.string().uri().max(2048).allow('', null),
    description: Joi.string().max(4000).allow('', null),
    duration: Joi.string().max(50).required(),
  }),
};

const updateSchema = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    title: Joi.string().min(1).max(255),
    description: Joi.string().max(4000).allow('', null),
    thumbnailUrl: Joi.string().uri().max(2048).allow('', null),
    videoUrl: Joi.string().uri().max(2048),
    duration: Joi.string().max(50),
  }).min(1),
};

export const lifestyleRouter = Router();

lifestyleRouter.get('/', validate(listQuery), lifestyleController.list);
lifestyleRouter.post('/', authenticate(), requireRole('artist', 'admin'), validate(createSchema), lifestyleController.create);

// Static/collection paths before the dynamic `/:id`.
lifestyleRouter.get('/liked/mine', authenticate(), lifestyleController.likedByMe);

lifestyleRouter.get('/:id', optionalAuth(), validate(idParam), lifestyleController.getOne);
lifestyleRouter.patch('/:id', authenticate(), validate(updateSchema), lifestyleController.update);
lifestyleRouter.delete('/:id', authenticate(), validate(idParam), lifestyleController.remove);

lifestyleRouter.post('/:id/views', validate(idParam), lifestyleController.view);
lifestyleRouter.post('/:id/likes', authenticate(), validate(idParam), lifestyleController.toggleLike);

export default lifestyleRouter;
