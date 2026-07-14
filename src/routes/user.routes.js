import { Router } from 'express';

import * as userController from '../controllers/user.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as schemas from '../validations/user.validation.js';

/**
 * @file Users router — mounted at `/api/v1/users`.
 *
 * | Method | Path | Auth | Notes |
 * | --- | --- | --- | --- |
 * | POST | /display-profiles | public | Batch {id,full_name,avatar_url} (=get_display_profiles) |
 * | GET | /me/following | Bearer | Ids of followed artists |
 * | GET | /me/preferences | Bearer | currency + ui prefs |
 * | PUT | /me/preferences/currency | Bearer | set display currency |
 * | PATCH | /me | Bearer | update own profile |
 * | GET | /:id | optional | public profile (+ isFollowing) |
 * | POST | /:id/follow | Bearer | follow artist |
 * | DELETE | /:id/follow | Bearer | unfollow artist |
 *
 * @module routes/user.routes
 */

export const userRouter = Router();

userRouter.post('/display-profiles', validate(schemas.displayProfilesSchema), userController.displayProfiles);

// Static `/me*` routes must be declared before the dynamic `/:id`.
userRouter.get('/me/following', authenticate(), userController.myFollowing);
userRouter.get('/me/preferences', authenticate(), userController.getPreferences);
userRouter.get('/me/ui-preferences', authenticate(), userController.getUiPreferences);
userRouter.put('/me/ui-preferences', authenticate(), validate(schemas.uiPreferencesSchema), userController.setUiPreferences);
userRouter.get('/me/stats', authenticate(), userController.myStats);
userRouter.put('/me/preferences/currency', authenticate(), validate(schemas.setCurrencySchema), userController.setCurrency);
userRouter.patch('/me', authenticate(), validate(schemas.updateProfileSchema), userController.updateMe);

userRouter.get('/:id', optionalAuth(), validate(schemas.userIdParam), userController.getProfile);
userRouter.get('/:id/badges', validate(schemas.userIdParam), userController.badges);
userRouter.post('/:id/follow', authenticate(), validate(schemas.userIdParam), userController.follow);
userRouter.delete('/:id/follow', authenticate(), validate(schemas.userIdParam), userController.unfollow);

export default userRouter;
