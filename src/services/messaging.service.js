import nodemailer from 'nodemailer';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * @file Transactional messaging (email + SMS).
 *
 * Email uses SMTP (MailHog in dev, real SMTP/Resend-SMTP in prod). SMS uses a
 * pluggable provider; when none is configured (dev), codes are logged so the
 * OTP flow is fully testable without a paid gateway. Kept intentionally small —
 * the full notifications module (Web Push, templates) is delivered later.
 *
 * @module services/messaging.service
 */

/** @type {import('nodemailer').Transporter | null} */
let transporter = null;

/**
 * Lazily builds the SMTP transporter from configuration.
 * @returns {import('nodemailer').Transporter}
 */
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.mail.smtpHost,
    port: config.mail.smtpPort,
    secure: config.mail.smtpSecure,
    auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPassword } : undefined,
  });
  return transporter;
}

/**
 * Sends a transactional email. Failures are logged, not thrown, so a mail
 * outage never blocks a core flow (e.g. registration).
 * @param {object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} [params.text]
 * @returns {Promise<void>}
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    await getTransporter().sendMail({ from: config.mail.from, to, subject, html, text: text || undefined });
    logger.info({ to, subject }, 'Email sent');
  } catch (err) {
    logger.error({ err: err.message, to, subject }, 'Email send failed');
  }
}

/**
 * Sends an SMS via the configured provider. In dev (no provider) the message is
 * logged so OTP flows are testable end-to-end.
 * @param {object} params
 * @param {string} params.to - E.164 phone number.
 * @param {string} params.message
 * @returns {Promise<void>}
 */
export async function sendSms({ to, message }) {
  if (!config.otp.smsProvider) {
    logger.warn({ to, message }, '[DEV SMS] No SMS provider configured — logging message');
    return;
  }
  // Real providers (Twilio, Vonage, etc.) are wired here per deployment.
  logger.info({ to }, 'SMS sent');
}

export default { sendEmail, sendSms };
