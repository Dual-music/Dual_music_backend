import { Router } from 'express';

import * as uploadController from '../controllers/upload.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as v from '../validations/upload.validation.js';

/**
 * @file Uploads router — mounted at `/api/v1/uploads`.
 *
 * `POST /presign` → presigned S3 `PUT` URL (client uploads directly to storage).
 * `POST /presign-download` → presigned `GET` URL for private objects (premium
 * replays). Both require authentication.
 *
 * @module routes/upload.routes
 */

export const uploadRouter = Router();

uploadRouter.use(authenticate());
uploadRouter.post('/presign', validate(v.presignUpload), uploadController.presign);
uploadRouter.post('/presign-download', validate(v.presignDownload), uploadController.presignDownload);
uploadRouter.post('/confirm', validate(v.confirm), uploadController.confirm);

export default uploadRouter;
