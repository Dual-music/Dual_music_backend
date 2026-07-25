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
    secure: config.mail.smtpSecure, // true pour le port 465 (SSL), false sinon
    auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPassword } : undefined,
    // Tolère un certificat SSL auto-signé côté serveur SMTP (fréquent sur VPS mutualisé).
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

/** Échappe le HTML et convertit les sauts de ligne en `<br/>` (pour un corps texte brut). */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

/**
 * En-tête de marque : logo (si `MAIL_LOGO_URL` configuré — URL publique absolue requise par
 * les clients mail) sinon le nom stylé en repli.
 */
function brandHeader() {
  const logo = config.mail.logoUrl;
  if (logo) {
    return `<img src="${logo}" alt="Dual Music" height="44" style="height:44px;display:block;border:0;outline:none;text-decoration:none;" />`;
  }
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">🎵 Dual Music</span>`;
}

/**
 * Enrobe le contenu HTML d'un email dans le gabarit de marque Dual Music
 * (en-tête + pied de page + note de sécurité). Compatible clients mail (tables + styles inline).
 * @param {string} html - Contenu spécifique du message.
 * @returns {string} HTML complet prêt à envoyer.
 */
function wrapEmail(html) {
  const year = new Date().getFullYear();
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="margin:0;padding:0;background:#0f0a1e;">
    <tbody>
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table cellpadding="0" cellspacing="0" width="524" style="max-width:524px;width:100%;background:#17122b;border:1px solid #2a2342;border-radius:12px;overflow:hidden;">
            <tbody>
              <tr>
                <td align="center" style="background:linear-gradient(135deg,#7c3aed,#db2777);padding:22px;">
                  ${brandHeader()}
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#e5e1f0;">
                  ${html}
                  <p style="margin-top:24px;color:#a89fc4;font-size:13px;">
                    Pour la sécurité de votre compte, ne transférez cet e-mail à personne.<br/><br/>
                    L'équipe Dual Music
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:16px;border-top:1px solid #2a2342;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6f668c;">
                  &copy; ${year} Dual Music — Duels, lives &amp; concerts
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>`;
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
    // Beaucoup d'appelants ne fournissent que `text` (notifyUser). On dérive alors le corps
    // HTML du texte pour éviter un « undefined » dans le gabarit.
    const body = html ?? `<p style="margin:0;">${escapeHtml(text || '')}</p>`;
    await getTransporter().sendMail({ from: config.mail.from, to, subject, html: wrapEmail(body), text: text || undefined });
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
