import { notifyUser } from '../jobs/notify.js';
import { db } from '../models/index.js';
import { emitToUser } from '../realtime/bus.js';
import { sendEmail } from '../services/messaging.service.js';
import { ApiError } from '../utils/ApiError.js';
import { generateOtp, hmacHash, safeEqual } from '../utils/crypto.js';
import { buildPaginationMeta, parsePagination } from '../utils/pagination.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { callProcedure } from '../utils/procedures.js';

/**
 * @file Withdrawals domain service — artist/manager payouts of wallet credits.
 *
 * Money-safety model: a request RESERVES funds by debiting the wallet up-front
 * (`reserve_withdrawal`); an admin then approves + marks it completed after the
 * external provider payout, or rejects it — which REFUNDS the wallet
 * (`revert_withdrawal`). A 6-digit PIN (bcrypt-hashed, lockout after 5 failed
 * attempts) gates every request; it can be reset via an emailed OTP.
 *
 * @module services/withdrawal.service
 */

const MAX_PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/** Reads `economic_config.withdrawal` (or an empty object). @returns {Promise<object>} */
async function withdrawalConfig() {
  // No `raw`: rely on the JSON getter so the value is an object on every dialect
  // (SQLite returns a string for JSON columns read raw).
  const row = await db.PlatformSetting.findByPk('economic_config');
  return row?.value?.withdrawal ?? {};
}

/** Resolves a user's fee % + per-method minimums from config and role. */
async function feeContext(userId) {
  const cfg = await withdrawalConfig();
  const roles = await db.UserRole.findAll({ where: { user_id: userId }, attributes: ['role'], raw: true });
  const isManager = roles.some((r) => r.role === 'manager');
  const feePct = Number((isManager ? cfg.manager_fee_pct : cfg.artist_fee_pct) ?? 0) || 0;
  const minByMethod = {
    mobile_money: Number(cfg.mobile_money_min_credits ?? 0) || 0,
    bank: Number(cfg.bank_required_min_credits ?? 0) || 0,
    paypal: Number(cfg.paypal_min_credits ?? 0) || 0,
  };
  return { feePct, minByMethod, autoProcess: Boolean(cfg.auto_process) };
}

/* -------------------------------------------------------------------------- */
/* PIN                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Whether the user has a withdrawal PIN configured.
 * @param {string} userId
 * @returns {Promise<{ hasPin: boolean }>}
 */
export async function hasPin(userId) {
  const row = await db.UserWithdrawalPin.findByPk(userId, { attributes: ['user_id'] });
  return { hasPin: Boolean(row) };
}

/**
 * Sets or changes the withdrawal PIN. Changing requires the current PIN.
 * @param {string} userId
 * @param {string} newPin - Exactly 6 digits (validated at the route layer).
 * @param {string} [currentPin]
 * @returns {Promise<{ success: true }>}
 * @throws {ApiError} 400 when current PIN is required/incorrect.
 */
export async function setPin(userId, newPin, currentPin) {
  const existing = await db.UserWithdrawalPin.findByPk(userId);
  const pinHash = await hashPassword(newPin);
  if (existing) {
    if (!currentPin) throw ApiError.badRequest('PIN_CURRENT_REQUIRED');
    const ok = await verifyPassword(currentPin, existing.pin_hash);
    if (!ok) throw ApiError.badRequest('PIN_WRONG_CURRENT');
    existing.pin_hash = pinHash;
    existing.failed_attempts = 0;
    existing.locked_until = null;
    await existing.save();
  } else {
    await db.UserWithdrawalPin.create({ user_id: userId, pin_hash: pinHash, failed_attempts: 0 });
  }
  return { success: true };
}

/**
 * Verifies a PIN, enforcing lockout after {@link MAX_PIN_ATTEMPTS} failures.
 * @param {string} userId
 * @param {string} pin
 * @returns {Promise<{ success: true }>}
 * @throws {ApiError} 400 no PIN · 423 locked · 401 wrong PIN.
 */
export async function verifyPin(userId, pin) {
  const row = await db.UserWithdrawalPin.findByPk(userId);
  if (!row) throw ApiError.badRequest('PIN_NOT_SET');
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    throw new ApiError(423, 'PIN_LOCKED', { details: { lockedUntil: row.locked_until } });
  }
  const ok = await verifyPassword(pin, row.pin_hash);
  if (!ok) {
    row.failed_attempts = (row.failed_attempts ?? 0) + 1;
    row.locked_until =
      row.failed_attempts >= MAX_PIN_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await row.save();
    throw ApiError.unauthorized('PIN_WRONG');
  }
  if (row.failed_attempts !== 0 || row.locked_until) {
    row.failed_attempts = 0;
    row.locked_until = null;
    await row.save();
  }
  return { success: true };
}

/**
 * Starts a PIN reset: generates a one-time code, stores its hash with a 15-min
 * expiry, and emails it to the account owner. Always resolves the same way
 * whether or not a PIN exists (no account enumeration).
 * @param {string} userId
 * @returns {Promise<{ sent: boolean }>}
 */
export async function requestPinReset(userId) {
  const profile = await db.Profile.findByPk(userId, { attributes: ['email'], raw: true });
  const otp = generateOtp(6);
  await db.WithdrawalPinResetToken.create({
    user_id: userId,
    otp_hash: hmacHash(otp),
    expires_at: new Date(Date.now() + 15 * 60_000),
    attempts: 0,
  });
  if (profile?.email) {
    await sendEmail({
      to: profile.email,
      subject: 'Réinitialisation du code de retrait',
      text: `Votre code de réinitialisation est : ${otp} (valable 15 minutes).`,
    }).catch(() => {});
  }
  return { sent: true };
}

/**
 * Confirms a PIN reset with the emailed OTP and sets a new PIN.
 * @param {string} userId
 * @param {string} otp
 * @param {string} newPin - Exactly 6 digits.
 * @returns {Promise<{ success: true }>}
 * @throws {ApiError} 400 invalid/expired code.
 */
export async function confirmPinReset(userId, otp, newPin) {
  const token = await db.WithdrawalPinResetToken.findOne({
    where: { user_id: userId, used_at: null },
    order: [['created_at', 'DESC']],
  });
  if (!token || new Date(token.expires_at) < new Date()) throw ApiError.badRequest('PIN_RESET_INVALID');
  if (!safeEqual(hmacHash(otp), token.otp_hash)) {
    token.attempts = (token.attempts ?? 0) + 1;
    await token.save();
    throw ApiError.badRequest('PIN_RESET_INVALID');
  }
  token.used_at = new Date();
  await token.save();

  const pinHash = await hashPassword(newPin);
  await db.UserWithdrawalPin.upsert({ user_id: userId, pin_hash: pinHash, failed_attempts: 0, locked_until: null });
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/* Net calculation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Computes the net payout after the applicable fee for a user.
 * @param {string} userId
 * @param {number} amount - Gross credits requested.
 * @returns {Promise<{ gross: number, feePct: number, fee: number, net: number }>}
 */
export async function calculateNet(userId, amount) {
  const { feePct } = await feeContext(userId);
  const fee = Math.round(amount * (feePct / 100) * 100) / 100;
  return { gross: amount, feePct, fee, net: Math.max(0, amount - fee) };
}

/* -------------------------------------------------------------------------- */
/* Request lifecycle                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Creates a withdrawal request: verifies the PIN, enforces the per-method
 * minimum, resolves the payout method, and RESERVES the funds atomically
 * (`reserve_withdrawal`). Admins are notified for manual review.
 *
 * @param {string} userId
 * @param {object} input - `{ amount, pin, payoutMethodId?, provider? }`
 * @returns {Promise<{ withdrawalId: string, status: string }>}
 * @throws {ApiError} PIN errors · 400 below minimum · 404 no payout method · 400 insufficient balance.
 */
export async function requestWithdrawal(userId, input) {
  await verifyPin(userId, input.pin);

  const method = input.payoutMethodId
    ? await db.UserPayoutMethod.findOne({ where: { id: input.payoutMethodId, user_id: userId }, raw: true })
    : await db.UserPayoutMethod.findOne({ where: { user_id: userId, is_default: true }, raw: true });
  if (!method) throw ApiError.notFound('NO_PAYOUT_METHOD');

  const { minByMethod, autoProcess } = await feeContext(userId);
  const min = minByMethod[method.method] ?? 0;
  if (min > 0 && input.amount < min) {
    throw ApiError.badRequest('WITHDRAWAL_BELOW_MINIMUM', { details: { min } });
  }

  const details = {
    payout_method_id: method.id,
    label: method.label,
    phone_number: method.phone_number,
    mobile_operator: method.mobile_operator,
    iban: method.iban,
    bank_name: method.bank_name,
    account_holder: method.account_holder,
    paypal_email: method.paypal_email,
  };
  const status = autoProcess ? 'approved' : 'pending';

  const out = await callProcedure(
    'reserve_withdrawal',
    [userId, input.amount, method.method, JSON.stringify(details), input.provider ?? '', status, autoProcess],
    ['success', 'code', 'id'],
  );
  if (!out.success) {
    if (out.code === 'insufficient_balance') throw ApiError.badRequest('WALLET_INSUFFICIENT');
    throw ApiError.badRequest('WITHDRAWAL_FAILED', { details: { code: out.code } });
  }

  // Notify admins of a new payout awaiting review (best-effort).
  const admins = await db.UserRole.findAll({ where: { role: 'admin' }, attributes: ['user_id'], raw: true });
  await Promise.allSettled(
    admins.map((a) =>
      notifyUser({
        userId: a.user_id,
        type: 'withdrawal',
        title: 'Nouvelle demande de retrait',
        message: `Un retrait de ${input.amount} crédits est en attente.`,
        data: { withdrawal_id: out.id },
        push: false,
      }),
    ),
  );

  return { withdrawalId: out.id, status };
}

/**
 * Lists the caller's withdrawal history (newest first).
 * @param {string} userId
 * @param {object} query - pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listMine(userId, query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  where.user_id = userId;
  const rows = await db.WithdrawalRequest.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Lists withdrawal requests for the admin queue (paginated).
 * @param {object} query - `status?` + pagination.
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function listAll(query) {
  const { limit, where, order, mode, offset } = parsePagination(query);
  if (query.status) where.status = query.status;
  const rows = await db.WithdrawalRequest.findAll({ where, order, limit, offset, raw: true });
  return { rows, pagination: buildPaginationMeta({ mode, rows, limit, page: query.page }) };
}

/**
 * Approves a pending withdrawal (admin) — funds already reserved; this clears it
 * for provider payout.
 * @param {string} id
 * @param {string} adminId
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 409 when not pending.
 */
export async function approve(id, adminId) {
  const req = await db.WithdrawalRequest.findByPk(id);
  if (!req) throw ApiError.notFound('NOT_FOUND');
  if (req.status !== 'pending') throw ApiError.conflict('WITHDRAWAL_NOT_PENDING');
  req.status = 'approved';
  req.processed_by = adminId;
  await req.save();
  emitToUser(req.user_id, 'tx:withdrawal', { status: 'approved', amount: Number(req.amount) });
  return req;
}

/**
 * Rejects a withdrawal (admin) and REFUNDS the reserved funds atomically.
 * @param {string} id
 * @param {string} adminId
 * @returns {Promise<{ reverted: boolean }>}
 * @throws {ApiError} 404.
 */
export async function reject(id, adminId) {
  const out = await callProcedure('revert_withdrawal', [id, adminId], ['success', 'code']);
  if (!out.success) {
    if (out.code === 'not_found') throw ApiError.notFound('NOT_FOUND');
    throw ApiError.badRequest('WITHDRAWAL_REVERT_FAILED', { details: { code: out.code } });
  }
  const req = await db.WithdrawalRequest.findByPk(id, { attributes: ['user_id', 'amount'], raw: true });
  if (req) {
    emitToUser(req.user_id, 'tx:withdrawal', { status: 'rejected', amount: Number(req.amount) });
    await notifyUser({
      userId: req.user_id,
      type: 'withdrawal',
      title: 'Retrait refusé',
      message: `Votre retrait de ${req.amount} crédits a été refusé et recrédité.`,
      data: { withdrawal_id: id },
      email: true,
    }).catch(() => {});
  }
  return { reverted: out.code !== 'already' };
}

/**
 * Marks an approved withdrawal as completed after the external payout, recording
 * the provider transaction reference (admin).
 * @param {string} id
 * @param {string} adminId
 * @param {string} [providerTxId]
 * @returns {Promise<object>}
 * @throws {ApiError} 404 · 409 when not approved.
 */
export async function complete(id, adminId, providerTxId) {
  const req = await db.WithdrawalRequest.findByPk(id);
  if (!req) throw ApiError.notFound('NOT_FOUND');
  if (!['approved', 'pending'].includes(req.status)) throw ApiError.conflict('WITHDRAWAL_NOT_APPROVED');
  req.status = 'completed';
  req.processed_by = adminId;
  req.processed_at = new Date();
  if (providerTxId) req.provider_tx_id = providerTxId;
  await req.save();
  emitToUser(req.user_id, 'tx:withdrawal', { status: 'completed', amount: Number(req.amount) });
  await notifyUser({
    userId: req.user_id,
    type: 'withdrawal',
    title: 'Retrait effectué',
    message: `Votre retrait de ${req.amount} crédits a été traité.`,
    data: { withdrawal_id: id },
    email: true,
  }).catch(() => {});
  return req;
}

/* -------------------------------------------------------------------------- */
/* Payout methods                                                             */
/* -------------------------------------------------------------------------- */

const METHOD_FIELDS = [
  'method',
  'label',
  'account_holder',
  'bank_name',
  'iban',
  'paypal_email',
  'phone_number',
  'mobile_operator',
];

/**
 * Lists a user's saved payout methods (default first).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listMethods(userId) {
  return db.UserPayoutMethod.findAll({
    where: { user_id: userId },
    order: [['is_default', 'DESC'], ['created_at', 'DESC']],
    raw: true,
  });
}

/**
 * Adds a payout method. The first method (or an explicit `is_default`) becomes
 * the default; setting a new default demotes the others atomically.
 * @param {string} userId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function addMethod(userId, input) {
  return db.sequelize.transaction(async (tx) => {
    const count = await db.UserPayoutMethod.count({ where: { user_id: userId }, transaction: tx });
    const makeDefault = input.is_default === true || count === 0;
    if (makeDefault) {
      await db.UserPayoutMethod.update({ is_default: false }, { where: { user_id: userId }, transaction: tx });
    }
    const data = { user_id: userId, is_default: makeDefault };
    for (const f of METHOD_FIELDS) if (input[f] !== undefined) data[f] = input[f];
    return db.UserPayoutMethod.create(data, { transaction: tx });
  });
}

/**
 * Updates a payout method (owner-scoped). Setting it default demotes the others.
 * @param {string} userId
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404.
 */
export async function updateMethod(userId, id, patch) {
  return db.sequelize.transaction(async (tx) => {
    const method = await db.UserPayoutMethod.findOne({ where: { id, user_id: userId }, transaction: tx });
    if (!method) throw ApiError.notFound('NOT_FOUND');
    if (patch.is_default === true) {
      await db.UserPayoutMethod.update({ is_default: false }, { where: { user_id: userId }, transaction: tx });
      method.is_default = true;
    }
    for (const f of METHOD_FIELDS) if (patch[f] !== undefined) method[f] = patch[f];
    await method.save({ transaction: tx });
    return method;
  });
}

/**
 * Deletes a payout method (owner-scoped).
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteMethod(userId, id) {
  const deleted = await db.UserPayoutMethod.destroy({ where: { id, user_id: userId } });
  return { removed: deleted > 0 };
}

export default {
  hasPin,
  setPin,
  verifyPin,
  requestPinReset,
  confirmPinReset,
  calculateNet,
  requestWithdrawal,
  listMine,
  listAll,
  approve,
  reject,
  complete,
  listMethods,
  addMethod,
  updateMethod,
  deleteMethod,
};
