import { config } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import { buildGoogleAuthUrl, handleGoogleCallback } from '../services/oauth.service.js';
import { randomToken } from '../utils/crypto.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @file Auth HTTP controllers (thin). Each handler delegates to a service and
 * shapes the uniform response; no business logic lives here.
 *
 * @module controllers/auth.controller
 */

/**
 * Extracts request context (user agent + client IP) for token bookkeeping.
 * @param {import('express').Request} req
 * @returns {{ userAgent: string, ip: string }}
 */
function reqCtx(req) {
  return { userAgent: String(req.headers['user-agent'] || ''), ip: req.ip };
}

/** POST /auth/register */
export async function register(req, res) {
  const result = await authService.register(req.body, reqCtx(req));
  return sendSuccess(res, result, { status: 201 });
}

/** POST /auth/login */
export async function login(req, res) {
  const result = await authService.login(req.body, reqCtx(req));
  return sendSuccess(res, result);
}

/** POST /auth/refresh */
export async function refresh(req, res) {
  const result = await authService.refresh(req.body.refreshToken, reqCtx(req));
  return sendSuccess(res, result);
}

/** POST /auth/logout (authenticated) */
export async function logout(req, res) {
  await authService.logout({
    refreshToken: req.body.refreshToken,
    jti: req.tokenPayload?.jti,
    exp: req.tokenPayload?.exp,
  });
  return sendSuccess(res, { success: true });
}

/** GET /auth/me (authenticated) */
export async function me(req, res) {
  const result = await authService.me(req.user.id);
  return sendSuccess(res, result);
}

/** POST /auth/otp/phone/send (authenticated) */
export async function sendPhoneOtp(req, res) {
  await authService.requestPhoneOtp(req.user.id);
  return sendSuccess(res, { sent: true });
}

/** POST /auth/otp/phone/verify (authenticated) */
export async function verifyPhoneOtp(req, res) {
  await authService.verifyPhoneOtp(req.user.id, req.body.code);
  return sendSuccess(res, { verified: true });
}

/** POST /auth/otp/email/send (authenticated) — (re)send an email-verification code. */
export async function sendEmailOtp(req, res) {
  await authService.requestEmailOtp(req.user.id);
  return sendSuccess(res, { sent: true });
}

/** POST /auth/otp/email/verify (authenticated) — confirm the emailed code. */
export async function verifyEmailOtp(req, res) {
  await authService.verifyEmailOtp(req.user.id, req.body.code);
  return sendSuccess(res, { verified: true });
}

/** POST /auth/password/forgot */
export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body.email);
  // Always 200 — never reveal whether the email exists.
  return sendSuccess(res, { sent: true });
}

/** POST /auth/password/reset */
export async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  return sendSuccess(res, { reset: true });
}

/** POST /auth/password/change (authenticated) */
export async function changePassword(req, res) {
  await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  return sendSuccess(res, { changed: true });
}

/** GET /auth/oauth/google — returns the consent URL (+ state cookie). */
export async function googleStart(req, res) {
  const state = randomToken(16);
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 10 * 60_000,
  });
  return sendSuccess(res, { url: buildGoogleAuthUrl(state) });
}

/** GET /auth/oauth/google/callback — exchanges code, redirects to frontend. */
export async function googleCallback(req, res) {
  const result = await handleGoogleCallback(req.query.code, reqCtx(req));
  const redirect = config.corsOrigins[0] || '/';
  const url = new URL('/auth/callback', redirect);
  url.searchParams.set('access_token', result.accessToken);
  url.searchParams.set('refresh_token', result.refreshToken);
  return res.redirect(url.toString());
}

export default {
  register,
  login,
  refresh,
  logout,
  me,
  sendPhoneOtp,
  verifyPhoneOtp,
  sendEmailOtp,
  verifyEmailOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  googleStart,
  googleCallback,
};
