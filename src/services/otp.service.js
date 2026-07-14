import { Op } from 'sequelize';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { generateOtp, hmacHash, safeEqual } from '../utils/crypto.js';

import { sendEmail, sendSms } from './messaging.service.js';

/**
 * @file One-time-password (OTP) service.
 *
 * Codes are numeric, short-lived (10 min), stored **hashed**, and limited to a
 * few verification attempts. Used for phone/email verification, passwordless
 * confirmation and password reset. Delivery goes through the messaging service
 * (SMS or email); in dev the code is also logged for testability.
 *
 * @module services/otp.service
 */

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Generates, stores and delivers an OTP.
 * @param {object} params
 * @param {string|null} [params.userId]
 * @param {'sms'|'email'} params.channel
 * @param {string} params.destination - Phone (E.164) or email.
 * @param {string} [params.purpose='phone_verify']
 * @returns {Promise<{ expiresAt: Date }>}
 * @throws {ApiError} 429 when requested again within the cooldown window.
 */
export async function sendOtp({ userId = null, channel, destination, purpose = 'phone_verify' }) {
  const recent = await db.OtpCode.findOne({
    where: { destination, purpose, created_at: { [Op.gt]: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    order: [['created_at', 'DESC']],
  });
  if (recent) throw ApiError.tooMany('OTP_RATE_LIMITED');

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);
  await db.OtpCode.create({
    user_id: userId,
    channel,
    destination,
    code_hash: hmacHash(code),
    purpose,
    expires_at: expiresAt,
    attempts: 0,
  });

  const text = `Dual Music — votre code de vérification est ${code}. Il expire dans ${Math.floor(config.otp.ttlSeconds / 60)} minutes.`;
  if (channel === 'sms') {
    await sendSms({ to: destination, message: text });
  } else {
    await sendEmail({ to: destination, subject: 'Dual Music — Code de vérification', html: `<p>${text}</p>`, text });
  }
  logger.info({ destination, purpose, channel }, 'OTP sent');
  return { expiresAt };
}

/**
 * Verifies an OTP for a destination/purpose. Consumes the code on success.
 * @param {object} params
 * @param {string} params.destination
 * @param {string} params.code
 * @param {string} [params.purpose='phone_verify']
 * @returns {Promise<{ userId: string|null }>} The user id linked to the OTP (if any).
 * @throws {ApiError} 400 OTP_INVALID / OTP_EXPIRED.
 */
export async function verifyOtp({ destination, code, purpose = 'phone_verify' }) {
  const otp = await db.OtpCode.findOne({
    where: { destination, purpose, consumed_at: null },
    order: [['created_at', 'DESC']],
  });
  if (!otp) throw ApiError.badRequest('OTP_INVALID');
  if (new Date(otp.expires_at).getTime() < Date.now()) throw ApiError.badRequest('OTP_EXPIRED');
  if (otp.attempts >= MAX_ATTEMPTS) throw ApiError.badRequest('OTP_INVALID');

  if (!safeEqual(otp.code_hash, hmacHash(code))) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest('OTP_INVALID');
  }

  otp.consumed_at = new Date();
  await otp.save();
  return { userId: otp.user_id };
}

export default { sendOtp, verifyOtp };
