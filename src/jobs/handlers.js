import { Op } from 'sequelize';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../models/index.js';
import { emitToRoom, roomName } from '../realtime/bus.js';
import { computeCreditsForRecharge } from '../services/payments/pricing.service.js';
import { purgeExpiredAccounts } from '../services/user.service.js';
import { checkPayment as cinetpayCheck } from '../services/payments/providers/cinetpay.client.js';
import { callProcedure } from '../utils/procedures.js';

import { notifyUser } from './notify.js';

/**
 * @file Background job handlers — the pure business logic behind every scheduled
 * task. Each export is idempotent and safe to run repeatedly: it is invoked
 * either by a BullMQ worker (when Redis is present) or by the in-process
 * fallback scheduler (dev / Redis-less). Handlers never throw for "nothing to
 * do"; they return a small summary object used for logging and admin reports.
 *
 * @module jobs/handlers
 */

/** Reminder lead window: notify ticket holders this long before start. */
const REMINDER_LEAD_MS = 30 * 60 * 1000;

/**
 * Refreshes fiat exchange rates from the configured provider and upserts
 * `exchange_rates(currency_code, rate_per_usd)`. The provider returns rates
 * against an arbitrary base; we normalize each to "units per 1 USD" so wallet
 * recharge math (`pricing.service`) stays base-agnostic.
 *
 * @returns {Promise<{ updated: number, source: 'api'|'skipped' }>}
 * @sideeffect Upserts rows in `exchange_rates`.
 */
export async function refreshExchangeRates() {
  const url = config.economy.exchangeRateApiUrl;
  let payload;
  try {
    const res = await fetch(url);
    payload = await res.json();
  } catch (err) {
    logger.warn({ err: err?.message }, 'exchange-rate provider unreachable — skipping');
    return { updated: 0, source: 'skipped' };
  }

  const rates = payload?.rates ?? payload?.conversion_rates ?? {};
  const usdPerBase = Number(rates.USD);
  if (!usdPerBase || Number.isNaN(usdPerBase)) {
    logger.warn('exchange-rate response missing USD anchor — skipping');
    return { updated: 0, source: 'skipped' };
  }

  const targets = await db.ExchangeRate.findAll({ attributes: ['currency_code'] });
  const codes = new Set(['USD', 'EUR', 'XOF', 'XAF', 'NGN', 'GHS', ...targets.map((t) => t.currency_code)]);

  let updated = 0;
  for (const code of codes) {
    const perBase = code === 'USD' ? usdPerBase : Number(rates[code]);
    if (!perBase || Number.isNaN(perBase)) continue;
    // rate_per_usd = (units of `code` per base) / (USD per base)
    const ratePerUsd = perBase / usdPerBase;
    await db.ExchangeRate.upsert({ currency_code: code, rate_per_usd: ratePerUsd, updated_at: new Date() });
    updated += 1;
  }
  logger.info({ updated }, 'exchange rates refreshed');
  return { updated, source: 'api' };
}

/**
 * Notifies ticket holders of concerts/competitions starting within the lead
 * window. Uses the per-event `*_reminders` tables to guarantee at-most-once
 * delivery (a `sent=true` row acts as the idempotency guard).
 *
 * @returns {Promise<{ concerts: number, competitions: number }>}
 * @sideeffect Inserts reminder rows + notifications; emits `event:reminder`.
 */
export async function sendEventReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + REMINDER_LEAD_MS);
  let concerts = 0;
  let competitions = 0;

  // --- Concerts ---------------------------------------------------------
  const upcomingConcerts = await db.Concert.findAll({
    where: {
      status: { [Op.in]: ['scheduled', 'published'] },
      scheduled_date: { [Op.between]: [now, soon] },
    },
  });
  for (const concert of upcomingConcerts) {
    const tickets = await db.ConcertTicket.findAll({ where: { concert_id: concert.id } });
    for (const ticket of tickets) {
      const already = await db.ConcertReminder.findOne({
        where: { concert_id: concert.id, user_id: ticket.user_id, reminder_type: 'start', sent: true },
      });
      if (already) continue;
      await db.ConcertReminder.create({
        concert_id: concert.id,
        user_id: ticket.user_id,
        reminder_type: 'start',
        sent: true,
      });
      await notifyUser({
        userId: ticket.user_id,
        type: 'event_reminder',
        title: 'Ton concert commence bientôt',
        message: `« ${concert.title} » démarre dans moins de 30 minutes.`,
        data: { kind: 'concert', concert_id: concert.id },
        push: true,
      });
      concerts += 1;
    }
    emitToRoom('/live', roomName('concert', concert.id), 'event:reminder', { concert_id: concert.id });
  }

  // --- Competitions -----------------------------------------------------
  const upcomingComps = await db.Competition.findAll({
    where: { status: 'published', start_at: { [Op.between]: [now, soon] } },
  });
  for (const comp of upcomingComps) {
    const tickets = await db.CompetitionTicket.findAll({ where: { competition_id: comp.id } });
    for (const ticket of tickets) {
      await notifyUser({
        userId: ticket.user_id,
        type: 'event_reminder',
        title: 'Ta compétition commence bientôt',
        message: `« ${comp.title} » démarre dans moins de 30 minutes.`,
        data: { kind: 'competition', competition_id: comp.id },
      });
      competitions += 1;
    }
    emitToRoom('/live', roomName('competition', comp.id), 'event:reminder', { competition_id: comp.id });
  }

  logger.info({ concerts, competitions }, 'event reminders dispatched');
  return { concerts, competitions };
}

/**
 * Assigns monthly Top-Donor badges for the current month. Aggregates gift value
 * (`gift_transactions` × `virtual_gifts.price`) plus paid-vote spend
 * (`duel_votes.amount`) per donor, ranks them, and rewrites `user_badges` for
 * the month (removing prior monthly badges first to stay idempotent).
 *
 * @returns {Promise<{ month: string, badgesAssigned: number }>}
 * @sideeffect Replaces this month's monthly badges; notifies winners.
 */
export async function assignMonthlyBadges() {
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  /** @type {Map<string, number>} */
  const totals = new Map();

  // Price lookup (no association needed): id → price.
  const catalog = await db.VirtualGift.findAll({ attributes: ['id', 'price'] });
  const priceById = new Map(catalog.map((g) => [g.id, Number(g.price ?? 0)]));

  const gifts = await db.GiftTransaction.findAll({
    where: { created_at: { [Op.gte]: start, [Op.lt]: end } },
    attributes: ['from_user_id', 'gift_id'],
  });
  for (const g of gifts) {
    const price = priceById.get(g.gift_id) ?? 0;
    totals.set(g.from_user_id, (totals.get(g.from_user_id) ?? 0) + price);
  }

  const votes = await db.DuelVote.findAll({
    where: { created_at: { [Op.gte]: start, [Op.lt]: end } },
    attributes: ['user_id', 'amount'],
  });
  for (const v of votes) {
    totals.set(v.user_id, (totals.get(v.user_id) ?? 0) + Number(v.amount ?? 0));
  }

  const ranked = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return { month: monthYear, badgesAssigned: 0 };

  const badgeFor = (rank) => {
    if (rank === 1) return { badge_type: 'top1_monthly', badge_name: 'Top 1 Mensuel', badge_icon: '🥇' };
    if (rank <= 3) return { badge_type: 'top3_monthly', badge_name: `Top ${rank} Mensuel`, badge_icon: rank === 2 ? '🥈' : '🥉' };
    if (rank <= 10) return { badge_type: 'top10_monthly', badge_name: 'Top 10 Mensuel', badge_icon: '⭐' };
    return null;
  };

  await db.UserBadge.destroy({
    where: { month_year: monthYear, badge_type: { [Op.in]: ['top1_monthly', 'top3_monthly', 'top10_monthly'] } },
  });

  let badgesAssigned = 0;
  for (let i = 0; i < ranked.length && i < 10; i += 1) {
    const [userId] = ranked[i];
    const def = badgeFor(i + 1);
    if (!def) break;
    await db.UserBadge.create({ user_id: userId, month_year: monthYear, is_active: true, earned_at: new Date(), ...def });
    await notifyUser({
      userId,
      type: 'badge',
      title: 'Nouveau badge mensuel !',
      message: `Tu as obtenu le badge « ${def.badge_name} » ${def.badge_icon}`,
      data: { badge_type: def.badge_type, month_year: monthYear },
      email: true,
    });
    badgesAssigned += 1;
  }
  logger.info({ month: monthYear, badgesAssigned }, 'monthly badges assigned');
  return { month: monthYear, badgesAssigned };
}

/**
 * Auto-closes competitions whose scheduled end has passed but that are still
 * marked `live`. Sets `status='finished'` and stamps `winner_announced_at`,
 * then broadcasts closure so live stages can transition to the ranking view.
 *
 * @returns {Promise<{ closed: number }>}
 * @sideeffect Updates competition rows; emits `competition:finished`.
 */
export async function closeCompetitions() {
  const now = new Date();
  const stale = await db.Competition.findAll({
    where: { status: 'live', end_at: { [Op.ne]: null, [Op.lt]: now } },
  });
  let closed = 0;
  for (const comp of stale) {
    comp.status = 'finished';
    comp.winner_announced_at = comp.winner_announced_at ?? now;
    await comp.save();
    emitToRoom('/live', roomName('competition', comp.id), 'competition:finished', { competition_id: comp.id });
    closed += 1;
  }
  if (closed) logger.info({ closed }, 'competitions auto-closed');
  return { closed };
}

/**
 * Reconciles CinetPay pay-ins that never received (or lost) their webhook.
 * Re-queries the provider for `pending` payin transactions and, when the
 * provider reports success, credits the wallet through the same idempotent
 * stored procedure the webhook uses (`cinetpay_credit_wallet`).
 *
 * @returns {Promise<{ checked: number, credited: number }>}
 * @sideeffect May credit wallets + write `credit_purchases` via procedure.
 */
export async function retryWebhooks() {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000); // only txns older than 2 min
  const pending = await db.CinetpayTransaction.findAll({
    where: { kind: 'payin', status: 'pending', created_at: { [Op.lt]: cutoff } },
    limit: 100,
  });

  let credited = 0;
  for (const tx of pending) {
    try {
      const status = await cinetpayCheck(tx.merchant_transaction_id);
      const ok = String(status?.code) === '00' || status?.status === 'ACCEPTED';
      if (!ok) continue;
      const { credits } = await computeCreditsForRecharge(Number(tx.amount), tx.currency, 'cinetpay');
      const out = await callProcedure(
        'cinetpay_credit_wallet',
        [tx.merchant_transaction_id, Number(credits)],
        ['ok', 'already', 'error', 'balance'],
      );
      if (out.ok && !out.already) credited += 1;
    } catch (err) {
      logger.warn({ err: err?.message, tx: tx.merchant_transaction_id }, 'webhook retry failed');
    }
  }
  if (pending.length) logger.info({ checked: pending.length, credited }, 'webhook reconciliation done');
  return { checked: pending.length, credited };
}

/**
 * Compiles a daily admin report for the previous UTC day (new users, credit
 * revenue, gift volume, pending withdrawals) and persists it as an
 * `admin_logs` entry plus an email to every admin.
 *
 * @returns {Promise<{ date: string, metrics: Record<string, number> }>}
 * @sideeffect Inserts one `admin_logs` row; emails admins.
 */
export async function adminDailyReport() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const range = { created_at: { [Op.gte]: start, [Op.lt]: end } };

  const [newUsers, purchases, gifts, pendingWithdrawals] = await Promise.all([
    db.Profile.count({ where: range }),
    db.CreditPurchase.findAll({ where: { ...range, status: 'completed' }, attributes: ['paid_amount'] }),
    db.GiftTransaction.count({ where: range }),
    db.WithdrawalRequest.count({ where: { status: 'pending' } }),
  ]);
  const revenue = purchases.reduce((sum, p) => sum + Number(p.paid_amount ?? 0), 0);
  const dateLabel = start.toISOString().slice(0, 10);

  const metrics = { newUsers, revenue, gifts, pendingWithdrawals };
  await db.AdminLog.create({
    action_type: 'daily_report',
    admin_name: 'system',
    target_type: 'report',
    target_name: dateLabel,
    details: metrics,
  });

  const admins = await db.UserRole.findAll({ where: { role: 'admin' }, attributes: ['user_id'] });
  await Promise.allSettled(
    admins.map((a) =>
      notifyUser({
        userId: a.user_id,
        type: 'admin_report',
        title: `Rapport quotidien — ${dateLabel}`,
        message: `Nouveaux inscrits : ${newUsers} · Revenu : ${revenue} · Cadeaux : ${gifts} · Retraits en attente : ${pendingWithdrawals}`,
        data: metrics,
        email: true,
        push: false,
      }),
    ),
  );
  logger.info({ date: dateLabel, ...metrics }, 'admin daily report generated');
  return { date: dateLabel, metrics };
}

/**
 * Registry of every schedulable job: its stable name, handler, and cron
 * expression (UTC). Consumed by both the BullMQ scheduler and the fallback.
 * @type {Array<{ name: string, handler: () => Promise<unknown>, cron: string }>}
 */
export const JOB_DEFINITIONS = [
  { name: 'refresh-exchange-rates', handler: refreshExchangeRates, cron: '0 4 * * *' },
  // Purge quotidienne (03:15 UTC) des comptes dont le délai de grâce de 20 j est écoulé.
  { name: 'purge-deleted-accounts', handler: purgeExpiredAccounts, cron: '15 3 * * *' },
  { name: 'event-reminders', handler: sendEventReminders, cron: '*/5 * * * *' },
  { name: 'close-competitions', handler: closeCompetitions, cron: '*/2 * * * *' },
  { name: 'retry-webhooks', handler: retryWebhooks, cron: '*/3 * * * *' },
  { name: 'assign-monthly-badges', handler: assignMonthlyBadges, cron: '0 2 1 * *' },
  { name: 'admin-daily-report', handler: adminDailyReport, cron: '30 6 * * *' },
];

export default { JOB_DEFINITIONS };
