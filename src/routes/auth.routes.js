import { Router } from 'express';

import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { loginLimiter, otpLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import * as schemas from '../validations/auth.validation.js';

/**
 * @file Auth router — mounted at `/api/v1/auth`.
 *
 * | Method | Path | Auth | Body/Query |
 * | --- | --- | --- | --- |
 * | POST | /register | public | email, password, fullName?, phone?, countryCode?, phoneCountryCode?, referralCode? |
 * | POST | /login | public (5/min) | email, password |
 * | POST | /refresh | public | refreshToken |
 * | POST | /logout | Bearer | refreshToken? |
 * | GET  | /me | Bearer | — |
 * | POST | /otp/phone/send | Bearer (3/10min) | — |
 * | POST | /otp/phone/verify | Bearer | code |
 * | POST | /password/forgot | public (3/10min) | email |
 * | POST | /password/reset | public | email, code, newPassword |
 * | POST | /password/change | Bearer | currentPassword?, newPassword |
 * | GET  | /oauth/google | public | — (returns consent URL) |
 * | GET  | /oauth/google/callback | public | code, state |
 *
 * @module routes/auth.routes
 */

export const authRouter = Router();

authRouter.post('/register', validate(schemas.registerSchema), authController.register);
authRouter.post('/login', loginLimiter, validate(schemas.loginSchema), authController.login);
authRouter.post('/refresh', validate(schemas.refreshSchema), authController.refresh);
authRouter.post('/logout', authenticate(), validate(schemas.logoutSchema), authController.logout);
authRouter.get('/me', authenticate(), authController.me);

authRouter.post('/otp/phone/send', authenticate(), otpLimiter, authController.sendPhoneOtp);
authRouter.post('/otp/phone/verify', authenticate(), validate(schemas.verifyOtpSchema), authController.verifyPhoneOtp);

authRouter.post('/otp/email/send', authenticate(), otpLimiter, authController.sendEmailOtp);
authRouter.post('/otp/email/verify', authenticate(), validate(schemas.verifyOtpSchema), authController.verifyEmailOtp);

authRouter.post('/password/forgot', otpLimiter, validate(schemas.forgotPasswordSchema), authController.forgotPassword);
authRouter.post('/password/reset', validate(schemas.resetPasswordSchema), authController.resetPassword);
authRouter.post('/password/change', authenticate(), validate(schemas.changePasswordSchema), authController.changePassword);

authRouter.get('/oauth/google', authController.googleStart);
authRouter.get('/oauth/google/callback', validate(schemas.googleCallbackSchema), authController.googleCallback);

export default authRouter;
