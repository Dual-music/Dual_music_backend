import { Op } from 'sequelize';

import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { notifyUser } from '../../jobs/notify.js';
import { db } from '../../models/index.js';
import { emitToUser } from '../../realtime/bus.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken, safeEqual } from '../../utils/crypto.js';
import { callProcedure } from '../../utils/procedures.js';
import { calculateNet } from '../withdrawal.service.js';

import { computePayoutAmount } from './pricing.service.js';
import * as cinetpay from './providers/cinetpay.client.js';

/**
 * @file Transferts CinetPay (PayOut) — versement d'un retrait en Mobile Money.
 *
 * ### Machine à états
 *
 * ```
 *  withdrawal_requests : pending|approved ──start──► processing ──┬──► completed
 *                                                                 └──► failed (remboursé)
 *  cinetpay_transactions(kind=payout) :      pending ─────────────┬──► success
 *                                                                 └──► failed
 * ```
 *
 * ### Invariants
 *
 * 1. Les fonds sont **déjà réservés** : `reserve_withdrawal` a débité le portefeuille
 *    à la création de la demande. Ce module ne débite jamais — il rembourse.
 * 2. Une réponse `2xx` de CinetPay signifie « ordre accepté », **pas** « argent versé ».
 *    Seul un statut `VAL` renvoyé par la vérification server-to-server clôt le retrait.
 * 3. Un statut intermédiaire (`NEW`, `PENDING`…) n'écrit **rien** : confondre « en cours »
 *    et « échoué » rembourserait un transfert qui peut encore aboutir — donc paierait
 *    deux fois.
 * 4. Tout mouvement comptable passe par une procédure stockée verrouillée et idempotente.
 *
 * @module services/payments/payout.service
 */

/** URL de notification des transferts (distincte de celle des encaissements). */
const payoutNotifyUrl = () =>
  config.cinetpay.payoutNotifyUrl || `${config.apiBaseUrl}/api/v1/payments/cinetpay/payout/webhook`;

/**
 * Retrouve le pays CinetPay d'un numéro à partir de son préfixe international.
 * Le plus long préfixe correspondant l'emporte (`+225` avant `+22`).
 *
 * @param {string} phone - Numéro normalisé, préfixe pays inclus.
 * @param {Array<{ country_code: string, phone_prefix: string }>} countries
 * @returns {object|null}
 */
export function detectCountryByPhone(phone, countries) {
  const normalized = String(phone).replace(/[\s.-]/g, '');
  return (
    [...countries]
      .sort((a, b) => String(b.phone_prefix).length - String(a.phone_prefix).length)
      .find((c) => normalized.startsWith(c.phone_prefix)) ?? null
  );
}

/** Normalise un numéro : espaces/points/tirets retirés, `00` initial converti en `+`. */
function normalizePhone(raw) {
  const cleaned = String(raw ?? '').replace(/[\s.()-]/g, '');
  return cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
}

/**
 * Lit une colonne JSON en tableau, quel que soit le dialecte.
 *
 * MySQL rend les colonnes `JSON` déjà désérialisées ; SQLite (utilisé par les
 * tests) les rend en chaîne dès qu'on lit en `raw`. Sans cette normalisation, une
 * liste blanche d'opérateurs se retrouve vide et **tout transfert est refusé** —
 * panne qui ne se voit que sur un dialecte.
 *
 * @param {unknown} value
 * @returns {Array<any>}
 */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Prépare et valide tout ce qu'exige un transfert, sans rien écrire.
 * Isolé pour être testable et réutilisable par l'aperçu admin.
 *
 * @param {object} request - Ligne `withdrawal_requests`.
 * @returns {Promise<{ country: object, operator: string, phone: string, amount: number, currency: string, netCredits: number }>}
 * @throws {ApiError} 400 — numéro absent/pays non couvert/opérateur invalide/montant nul.
 */
async function resolveTransferTarget(request) {
  const details = request.payment_details ?? {};
  const phone = normalizePhone(details.phone_number);
  if (!phone) throw ApiError.badRequest('PAYOUT_PHONE_MISSING');

  const countries = await db.CinetpayCountry.findAll({ where: { is_active: true }, raw: true });
  const country = detectCountryByPhone(phone, countries);
  if (!country) throw ApiError.badRequest('PAYOUT_COUNTRY_UNSUPPORTED', { details: { phone } });

  // Liste blanche stricte : un code opérateur erroné envoie l'argent nulle part.
  const operators = asArray(country.operators);
  const wanted = String(details.mobile_operator ?? '').trim();
  const operator = operators.find((o) => o.code === wanted)?.code;
  if (!operator) {
    throw ApiError.badRequest('PAYOUT_OPERATOR_INVALID', {
      details: { provided: wanted || null, allowed: operators.map((o) => o.code) },
    });
  }

  // La commission de retrait reste à la plateforme : on verse le net.
  const { net: netCredits } = await calculateNet(request.user_id, Number(request.amount));
  const { amount } = await computePayoutAmount(netCredits, country.currency);
  if (amount <= 0) {
    throw ApiError.badRequest('PAYOUT_AMOUNT_TOO_LOW', { details: { currency: country.currency } });
  }

  return { country, operator, phone, amount, currency: country.currency, netCredits };
}

/**
 * Émet un transfert CinetPay pour une demande de retrait.
 *
 * Séquence : validation → `cinetpay_start_payout` (verrou + passage en `processing`,
 * ce qui rend un double envoi impossible) → appel provider → remboursement immédiat
 * si l'ordre est refusé. L'état final reste au webhook.
 *
 * @param {object} p
 * @param {string} p.withdrawalId
 * @param {string} p.actorId - Utilisateur déclencheur (admin ou propriétaire).
 * @param {boolean} p.isAdmin
 * @returns {Promise<{ merchantTransactionId: string, amount: number, currency: string, status: 'processing' }>}
 * @throws {ApiError} 404 demande inconnue · 403 accès refusé · 409 déjà soumise ·
 *   400 validation ou refus du provider (les crédits sont alors remboursés).
 * @sideeffect Insère une transaction payout, bascule la demande en `processing`,
 *   appelle CinetPay, notifie l'utilisateur.
 */
export async function initiateCinetpayPayout({ withdrawalId, actorId, isAdmin }) {
  const request = await db.WithdrawalRequest.findByPk(withdrawalId);
  if (!request) throw ApiError.notFound('NOT_FOUND');

  // Le propriétaire ne peut déclencher que si le retrait est en versement automatique.
  if (!isAdmin && !(request.user_id === actorId && request.auto_processed)) {
    throw ApiError.forbidden('FORBIDDEN');
  }
  if (['completed', 'processing'].includes(request.status)) {
    throw ApiError.conflict('PAYOUT_ALREADY_SUBMITTED', { details: { status: request.status } });
  }

  const target = await resolveTransferTarget(request);
  const merchantId = `po_${randomToken(12)}`;
  const notifyToken = randomToken(24);

  // Verrou métier : la procédure refuse toute demande qui n'est plus payable, ce
  // qui neutralise deux admins cliquant simultanément.
  const start = await callProcedure(
    'cinetpay_start_payout',
    [
      withdrawalId, merchantId, target.country.country_code, target.operator,
      target.amount, target.currency, target.phone, notifyToken,
    ],
    ['success', 'code', 'user_id', 'credits'],
  );
  if (!start.success) {
    if (start.code === 'not_found') throw ApiError.notFound('NOT_FOUND');
    if (String(start.code).startsWith('not_payable')) {
      throw ApiError.conflict('PAYOUT_ALREADY_SUBMITTED', { details: { code: start.code } });
    }
    throw ApiError.badRequest('PAYOUT_FAILED', { details: { code: start.code } });
  }

  const init = await cinetpay
    .initTransfer({
      countryCode: target.country.country_code,
      transactionId: merchantId,
      amount: target.amount,
      currency: target.currency,
      paymentMethod: target.operator,
      phone: target.phone,
      notifyToken,
      notifyUrl: payoutNotifyUrl(),
      reason: 'Retrait Dual Music',
    })
    .catch((err) => ({ accepted: false, raw: { error: err.message }, message: err.message }));

  await db.CinetpayTransaction.update(
    {
      raw_init_response: init.raw ?? {},
      cinetpay_transaction_id: init.providerTxId ?? null,
      updated_at: new Date(),
    },
    { where: { merchant_transaction_id: merchantId } },
  );

  if (!init.accepted) {
    // Ordre refusé d'emblée : on rend les crédits sans attendre de webhook, qui
    // n'arrivera jamais pour un transfert que CinetPay n'a pas enregistré.
    await revertPayout(merchantId, `init_rejected: ${init.message ?? 'unknown'}`);
    throw ApiError.badRequest('PAYMENT_PROVIDER_ERROR', {
      details: { message: init.message || 'Transfert refusé par CinetPay.' },
    });
  }

  logger.info({ merchantId, withdrawalId, amount: target.amount, currency: target.currency }, 'CinetPay payout submitted');
  emitToUser(request.user_id, 'tx:withdrawal', { status: 'processing', amount: Number(request.amount) });

  return {
    merchantTransactionId: merchantId,
    amount: target.amount,
    currency: target.currency,
    status: 'processing',
  };
}

/**
 * Confirme un transfert versé : clôt la transaction et la demande de retrait.
 * @param {string} merchantId
 * @returns {Promise<{ ok: boolean, already: boolean }>}
 */
async function confirmPayout(merchantId) {
  const out = await callProcedure(
    'cinetpay_confirm_payout',
    [merchantId],
    ['success', 'code', 'user_id', 'credits'],
  );
  if (!out.success) {
    logger.error({ merchantId, code: out.code }, 'CinetPay payout confirm failed');
    return { ok: false, already: false };
  }
  if (out.code === 'already') return { ok: true, already: true };

  emitToUser(out.user_id, 'tx:withdrawal', { status: 'completed', amount: Number(out.credits) });
  await notifyUser({
    userId: out.user_id,
    type: 'withdrawal',
    title: 'Retrait effectué',
    message: `Votre retrait de ${Number(out.credits)} crédits a été versé.`,
    data: { merchant_transaction_id: merchantId },
    email: true,
  }).catch(() => {});
  return { ok: true, already: false };
}

/**
 * Rembourse un transfert échoué : recrédite le portefeuille et marque l'échec.
 * @param {string} merchantId
 * @param {string} reason - Motif horodaté, conservé dans `error_message`.
 * @returns {Promise<{ ok: boolean, already: boolean }>}
 */
async function revertPayout(merchantId, reason) {
  const out = await callProcedure(
    'cinetpay_revert_payout',
    [merchantId, String(reason).slice(0, 500)],
    ['success', 'code', 'user_id', 'credits'],
  );
  if (!out.success) {
    // `already_settled` = le transfert est validé côté provider alors qu'on tente
    // de le rembourser : incohérence financière, alerte immédiate.
    logger.error({ merchantId, code: out.code, reason }, 'CinetPay payout revert failed');
    if (out.code === 'already_settled') {
      await raiseAlert('payout_revert_conflict', 'critical', { merchantId, reason });
    }
    return { ok: false, already: false };
  }
  if (out.code === 'already') return { ok: true, already: true };

  const credits = Number(out.credits ?? 0);
  emitToUser(out.user_id, 'tx:withdrawal', { status: 'failed', amount: credits });
  await notifyUser({
    userId: out.user_id,
    type: 'withdrawal',
    title: 'Retrait non abouti',
    message: `Votre retrait n'a pas pu être versé. ${credits} crédits ont été recrédités.`,
    data: { merchant_transaction_id: merchantId },
    email: true,
  }).catch(() => {});
  return { ok: true, already: false };
}

/**
 * Applique le statut canonique d'un transfert (partagé par le webhook et la
 * réconciliation, d'où leur équivalence exacte de comportement).
 *
 * @param {object} tx - Ligne `cinetpay_transactions` (kind=payout).
 * @returns {Promise<'confirmed'|'reverted'|'pending'|'error'>}
 */
async function settleFromProvider(tx) {
  let check;
  try {
    check = await cinetpay.checkTransfer({
      countryCode: tx.country_code,
      transactionId: tx.merchant_transaction_id,
    });
  } catch (err) {
    logger.warn({ err: err.message, merchantId: tx.merchant_transaction_id }, 'CinetPay transfer check failed');
    return 'error';
  }

  await db.CinetpayTransaction.update(
    { raw_verify_response: check.raw ?? {}, updated_at: new Date() },
    { where: { id: tx.id } },
  );

  if (check.accepted) {
    await confirmPayout(tx.merchant_transaction_id);
    return 'confirmed';
  }
  if (check.rejected) {
    await revertPayout(tx.merchant_transaction_id, `provider_status: ${check.status}`);
    return 'reverted';
  }
  // Ni validé ni rejeté → toujours en cours : ne rien écrire.
  return 'pending';
}

/**
 * Traite une notification de transfert CinetPay.
 *
 * Le corps ne fait jamais autorité : il sert à identifier la transaction et à
 * prouver son origine (`notify_token`). Le statut vient d'un appel server-to-server.
 *
 * @param {Record<string, any>} body - Corps analysé (form-urlencoded ou JSON).
 * @param {string} [headerToken] - Valeur de l'en-tête `x-token`, si présent.
 * @returns {Promise<{ ok: boolean, outcome?: string, reason?: string }>}
 *   `ok:false` + `reason:'bad_token'` → le contrôleur doit répondre 403.
 */
export async function handleCinetpayPayoutWebhook(body, headerToken) {
  const merchantId = String(
    body?.client_transaction_id || body?.merchant_transaction_id || body?.transaction_id || body?.cpm_trans_id || '',
  );
  if (!merchantId) return { ok: false, reason: 'missing_id' };

  const tx = await db.CinetpayTransaction.findOne({
    where: { merchant_transaction_id: merchantId, kind: 'payout' },
  });
  // Transaction inconnue : acquitter quand même, sinon le provider réessaie
  // indéfiniment une ressource qui n'existera jamais.
  if (!tx) {
    logger.warn({ merchantId }, 'CinetPay payout webhook for unknown transaction');
    return { ok: true, outcome: 'unknown' };
  }

  const incoming = String(body?.notify_token || body?.cpm_custom || headerToken || '');
  if (!safeEqual(incoming, tx.notify_token)) {
    logger.warn({ merchantId }, 'CinetPay payout webhook: invalid notify_token');
    await raiseAlert('payout_webhook_bad_token', 'warning', { merchantId });
    return { ok: false, reason: 'bad_token' };
  }

  await tx.update({ raw_webhook_payload: body ?? {}, updated_at: new Date() });

  if (tx.status === 'success' || tx.status === 'failed') return { ok: true, outcome: 'already' };

  const outcome = await settleFromProvider(tx);
  return { ok: true, outcome };
}

/**
 * Rattrape les transferts dont la notification s'est perdue. Applique exactement
 * la même logique que le webhook — d'où l'idempotence des procédures.
 *
 * @param {object} [opts]
 * @param {number} [opts.minAgeMs=180000] - Ancienneté minimale avant vérification.
 * @param {number} [opts.limit=100]
 * @returns {Promise<{ checked: number, confirmed: number, reverted: number, stillPending: number }>}
 * @sideeffect Peut clôturer des retraits ou recréditer des portefeuilles.
 */
export async function reconcileCinetpayPayouts({ minAgeMs = 3 * 60 * 1000, limit = 100 } = {}) {
  const pending = await db.CinetpayTransaction.findAll({
    where: {
      kind: 'payout',
      status: 'pending',
      created_at: {
        [Op.lt]: new Date(Date.now() - minAgeMs),
        // Au-delà de 7 jours un transfert ne bougera plus : on cesse d'interroger
        // le provider et le cas relève du support.
        [Op.gt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    order: [['created_at', 'ASC']],
    limit,
  });

  const tally = { checked: pending.length, confirmed: 0, reverted: 0, stillPending: 0 };
  for (const tx of pending) {
    const outcome = await settleFromProvider(tx);
    if (outcome === 'confirmed') tally.confirmed += 1;
    else if (outcome === 'reverted') tally.reverted += 1;
    else tally.stillPending += 1;
  }
  if (tally.checked) logger.info(tally, 'CinetPay payout reconciliation done');
  return tally;
}

/* -------------------------------------------------------------------------- */
/* Soldes marchands                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre une alerte d'exploitation (best-effort : ne doit jamais faire
 * échouer le flux financier qui l'a déclenchée).
 * @param {string} event
 * @param {'info'|'warning'|'critical'} severity
 * @param {Record<string, unknown>} payload
 * @returns {Promise<void>}
 */
async function raiseAlert(event, severity, payload) {
  await db.CinetpayAlert.create({
    event,
    severity,
    payload,
    transaction_id: payload?.merchantId ?? null,
  }).catch((err) => logger.warn({ err: err.message, event }, 'cinetpay alert insert failed'));
}

/**
 * Lit les soldes marchands de tous les pays actifs (tableau de bord admin).
 * @returns {Promise<Array<{ country: string, currency: string, ok: boolean, available: number|null, error?: string }>>}
 */
export async function getCinetpayBalances() {
  const countries = await db.CinetpayCountry.findAll({ where: { is_active: true }, raw: true });
  const results = [];
  for (const c of countries) {
    try {
      const bal = await cinetpay.getBalances({ countryCode: c.country_code });
      results.push({
        country: c.country_code,
        currency: bal.currency ?? c.currency,
        ok: bal.ok,
        available: bal.available,
      });
    } catch (err) {
      results.push({ country: c.country_code, currency: c.currency, ok: false, available: null, error: err.message });
    }
  }
  return results;
}

/**
 * Vérifie les soldes marchands et lève une alerte sous le seuil configuré
 * (`CINETPAY_BALANCE_ALERT_THRESHOLD`). Un compte à sec fait échouer tous les
 * retraits du pays sans autre signal visible.
 *
 * @returns {Promise<{ checked: number, alerted: number }>}
 */
export async function checkCinetpayBalances() {
  const threshold = Number(config.cinetpay.balanceAlertThreshold) || 0;
  if (threshold <= 0) return { checked: 0, alerted: 0 };

  const balances = await getCinetpayBalances();
  let alerted = 0;
  for (const b of balances) {
    if (b.ok && b.available !== null && b.available < threshold) {
      await raiseAlert('balance_low', 'warning', { ...b, threshold });
      alerted += 1;
    } else if (!b.ok) {
      await raiseAlert('balance_unreadable', 'info', b);
    }
  }
  if (alerted) logger.warn({ alerted, threshold }, 'CinetPay merchant balance below threshold');
  return { checked: balances.length, alerted };
}

export default {
  detectCountryByPhone,
  initiateCinetpayPayout,
  handleCinetpayPayoutWebhook,
  reconcileCinetpayPayouts,
  getCinetpayBalances,
  checkCinetpayBalances,
};
