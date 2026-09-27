import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Le provider et l'appel de procédure stockée sont simulés ; la base (SQLite) est
// réelle, donc la persistance des transactions et la conversion crédits → devise
// locale (qui lit `platform_settings` + `exchange_rates`) sont exercées pour de vrai.
vi.mock('../src/services/payments/providers/cinetpay.client.js', () => ({
  initTransfer: vi.fn(),
  checkTransfer: vi.fn(),
  getBalances: vi.fn(),
}));
vi.mock('../src/utils/procedures.js', () => ({ callProcedure: vi.fn(), default: {} }));
vi.mock('../src/jobs/notify.js', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined), default: {} }));
vi.mock('../src/realtime/bus.js', () => ({
  emitToUser: vi.fn(),
  emitToRoom: vi.fn(),
  roomName: vi.fn(),
  default: {},
}));

import { db } from '../src/models/index.js';
import * as payout from '../src/services/payments/payout.service.js';
import * as cinetpay from '../src/services/payments/providers/cinetpay.client.js';
import { callProcedure } from '../src/utils/procedures.js';

/**
 * @file Transferts CinetPay (PayOut) — couverture des invariants financiers :
 * validation de la cible, verrou anti-double-envoi, remboursement immédiat sur
 * refus, autorité exclusive du webhook sur l'état final, et surtout le
 * tri-état « en cours ≠ échoué » qui évite de payer deux fois.
 */

const UID = '55555555-5555-5555-5555-555555555555';
const OTHER = '66666666-6666-6666-6666-666666666666';

/** Crée une demande de retrait prête à être versée. */
async function seedRequest(id, overrides = {}) {
  return db.WithdrawalRequest.create({
    id,
    user_id: UID,
    amount: 1000,
    status: 'approved',
    payment_method: 'mobile_money',
    payment_details: { phone_number: '+225 07 00 00 00', mobile_operator: 'OM_CI' },
    auto_processed: false,
    ...overrides,
  });
}

/** Crée une transaction de transfert en attente. */
async function seedPayoutTx(merchantId, overrides = {}) {
  return db.CinetpayTransaction.create({
    merchant_transaction_id: merchantId,
    notify_token: `tok_${merchantId}`,
    user_id: UID,
    amount: 3000,
    currency: 'XOF',
    country_code: 'CI',
    payment_method: 'OM_CI',
    phone_number: '+2250700000',
    kind: 'payout',
    status: 'pending',
    credits_amount: 1000,
    ...overrides,
  });
}

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  await db.PlatformSetting.create({
    key: 'economic_config',
    value: { credit_value_usd: 0.01, withdrawal: { artist_fee_pct: 10 } },
  });
  await db.ExchangeRate.bulkCreate([
    { currency_code: 'USD', rate_per_usd: 1, name: 'US Dollar', symbol: '$' },
    { currency_code: 'XOF', rate_per_usd: 600, name: 'CFA', symbol: 'F' },
  ]);
  await db.CinetpayCountry.create({
    country_code: 'CI',
    currency: 'XOF',
    is_active: true,
    country_name: "Côte d'Ivoire",
    phone_prefix: '+225',
    operators: [{ code: 'OM_CI', label: 'Orange Money' }, { code: 'WAVE_CI', label: 'Wave' }],
    secret_key_name: 'K',
    secret_password_name: 'P',
  });
  await db.CinetpayCountry.create({
    country_code: 'CM',
    currency: 'XAF',
    is_active: true,
    country_name: 'Cameroun',
    phone_prefix: '+237',
    operators: [{ code: 'OM_CM', label: 'Orange Money' }],
    secret_key_name: 'K2',
    secret_password_name: 'P2',
  });
});

afterAll(async () => {
  await db.sequelize.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectCountryByPhone', () => {
  const countries = [
    { country_code: 'CI', phone_prefix: '+225' },
    { country_code: 'CM', phone_prefix: '+237' },
    { country_code: 'XX', phone_prefix: '+22' },
  ];

  it('retient le préfixe le plus long (évite qu’un préfixe court capte un pays voisin)', () => {
    expect(payout.detectCountryByPhone('+225070000', countries).country_code).toBe('CI');
  });

  it('tolère les espaces de saisie', () => {
    expect(payout.detectCountryByPhone('+237 6 90 00 00', countries).country_code).toBe('CM');
  });

  it('renvoie null pour un pays non couvert', () => {
    expect(payout.detectCountryByPhone('+33612345678', countries)).toBeNull();
  });
});

describe('initiateCinetpayPayout — validation', () => {
  it('404 sur une demande inconnue', async () => {
    await expect(
      payout.initiateCinetpayPayout({ withdrawalId: 'ghost', actorId: UID, isAdmin: true }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuse un tiers non admin', async () => {
    await seedRequest('11111111-0000-0000-0000-000000000001');
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '11111111-0000-0000-0000-000000000001',
        actorId: OTHER,
        isAdmin: false,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuse le propriétaire quand la demande n’est pas en versement automatique', async () => {
    await seedRequest('11111111-0000-0000-0000-000000000002', { auto_processed: false });
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '11111111-0000-0000-0000-000000000002',
        actorId: UID,
        isAdmin: false,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuse une demande déjà en cours de versement', async () => {
    await seedRequest('11111111-0000-0000-0000-000000000003', { status: 'processing' });
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '11111111-0000-0000-0000-000000000003',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYOUT_ALREADY_SUBMITTED' });
    expect(cinetpay.initTransfer).not.toHaveBeenCalled();
  });

  it('refuse une demande sans numéro de téléphone', async () => {
    await seedRequest('11111111-0000-0000-0000-000000000004', { payment_details: {} });
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '11111111-0000-0000-0000-000000000004',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYOUT_PHONE_MISSING' });
  });

  it('refuse un pays non couvert', async () => {
    await seedRequest('11111111-0000-0000-0000-000000000005', {
      payment_details: { phone_number: '+33612345678', mobile_operator: 'OM_CI' },
    });
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '11111111-0000-0000-0000-000000000005',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYOUT_COUNTRY_UNSUPPORTED' });
  });

  it('refuse un opérateur hors liste blanche du pays', async () => {
    await seedRequest('11111111-0000-0000-0000-000000000006', {
      payment_details: { phone_number: '+225070000', mobile_operator: 'OM_CM' },
    });
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '11111111-0000-0000-0000-000000000006',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYOUT_OPERATOR_INVALID' });
    expect(cinetpay.initTransfer).not.toHaveBeenCalled();
  });
});

describe('initiateCinetpayPayout — émission', () => {
  it('verse le NET après commission, converti en devise locale', async () => {
    await seedRequest('22222222-0000-0000-0000-000000000001');
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });
    cinetpay.initTransfer.mockResolvedValue({ accepted: true, providerTxId: 'cp_tr_1', raw: {} });

    const res = await payout.initiateCinetpayPayout({
      withdrawalId: '22222222-0000-0000-0000-000000000001',
      actorId: UID,
      isAdmin: true,
    });

    // 1000 crédits − 10 % = 900 nets → 900 × 0,01 USD = 9 USD → × 600 = 5400 XOF
    expect(res).toMatchObject({ amount: 5400, currency: 'XOF', status: 'processing' });
    expect(cinetpay.initTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5400, currency: 'XOF', paymentMethod: 'OM_CI', countryCode: 'CI' }),
    );
  });

  it('réserve via la procédure AVANT d’appeler le provider', async () => {
    await seedRequest('22222222-0000-0000-0000-000000000002');
    const order = [];
    vi.mocked(callProcedure).mockImplementation(async (name) => {
      order.push(`proc:${name}`);
      return { success: true, code: 'ok', user_id: UID, credits: 1000 };
    });
    cinetpay.initTransfer.mockImplementation(async () => {
      order.push('provider');
      return { accepted: true, providerTxId: null, raw: {} };
    });

    await payout.initiateCinetpayPayout({
      withdrawalId: '22222222-0000-0000-0000-000000000002',
      actorId: UID,
      isAdmin: true,
    });
    expect(order).toEqual(['proc:cinetpay_start_payout', 'provider']);
  });

  it('rembourse immédiatement quand le provider refuse l’ordre', async () => {
    await seedRequest('22222222-0000-0000-0000-000000000003');
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });
    cinetpay.initTransfer.mockResolvedValue({ accepted: false, message: 'insufficient merchant balance', raw: {} });

    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '22222222-0000-0000-0000-000000000003',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });

    expect(callProcedure).toHaveBeenCalledWith(
      'cinetpay_revert_payout',
      [expect.any(String), expect.stringContaining('init_rejected')],
      ['success', 'code', 'user_id', 'credits'],
    );
  });

  it('rembourse aussi quand l’appel provider lève (réseau, timeout)', async () => {
    await seedRequest('22222222-0000-0000-0000-000000000004');
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });
    cinetpay.initTransfer.mockRejectedValue(new Error('network down'));

    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '22222222-0000-0000-0000-000000000004',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
    expect(callProcedure).toHaveBeenCalledWith(
      'cinetpay_revert_payout',
      expect.any(Array),
      expect.any(Array),
    );
  });

  it('propage le conflit quand la procédure juge la demande non payable', async () => {
    await seedRequest('22222222-0000-0000-0000-000000000005');
    vi.mocked(callProcedure).mockResolvedValue({ success: false, code: 'not_payable:completed' });
    await expect(
      payout.initiateCinetpayPayout({
        withdrawalId: '22222222-0000-0000-0000-000000000005',
        actorId: UID,
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: 'PAYOUT_ALREADY_SUBMITTED' });
    expect(cinetpay.initTransfer).not.toHaveBeenCalled();
  });
});

describe('handleCinetpayPayoutWebhook', () => {
  it('ignore un corps sans identifiant', async () => {
    await expect(payout.handleCinetpayPayoutWebhook({})).resolves.toMatchObject({ reason: 'missing_id' });
  });

  it('acquitte une transaction inconnue (pas de boucle de relance)', async () => {
    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'ghost' }),
    ).resolves.toMatchObject({ ok: true, outcome: 'unknown' });
  });

  it('rejette un notify_token invalide sans appeler le provider', async () => {
    await seedPayoutTx('po_forged');
    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'po_forged', notify_token: 'wrong' }),
    ).resolves.toMatchObject({ ok: false, reason: 'bad_token' });
    expect(cinetpay.checkTransfer).not.toHaveBeenCalled();
  });

  it('confirme le retrait sur statut VAL', async () => {
    await seedPayoutTx('po_ok');
    cinetpay.checkTransfer.mockResolvedValue({ accepted: true, rejected: false, status: 'VAL', code: '00', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });

    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'po_ok', notify_token: 'tok_po_ok' }),
    ).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
    expect(callProcedure).toHaveBeenCalledWith(
      'cinetpay_confirm_payout', ['po_ok'], ['success', 'code', 'user_id', 'credits'],
    );
  });

  it('rembourse sur statut de rejet définitif', async () => {
    await seedPayoutTx('po_ko');
    cinetpay.checkTransfer.mockResolvedValue({ accepted: false, rejected: true, status: 'REJET', code: '', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });

    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'po_ko', notify_token: 'tok_po_ko' }),
    ).resolves.toMatchObject({ ok: true, outcome: 'reverted' });
    expect(callProcedure).toHaveBeenCalledWith(
      'cinetpay_revert_payout',
      ['po_ko', expect.stringContaining('REJET')],
      ['success', 'code', 'user_id', 'credits'],
    );
  });

  it('NE REMBOURSE PAS un transfert encore en cours — invariant anti-double-paiement', async () => {
    await seedPayoutTx('po_wait');
    cinetpay.checkTransfer.mockResolvedValue({ accepted: false, rejected: false, status: 'NEW', code: '', raw: {} });

    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'po_wait', notify_token: 'tok_po_wait' }),
    ).resolves.toMatchObject({ ok: true, outcome: 'pending' });

    // Aucune écriture comptable : ni confirmation, ni remboursement.
    expect(callProcedure).not.toHaveBeenCalled();
    const tx = await db.CinetpayTransaction.findOne({ where: { merchant_transaction_id: 'po_wait' } });
    expect(tx.status).toBe('pending');
  });

  it('court-circuite une transaction déjà réglée', async () => {
    await seedPayoutTx('po_done', { status: 'success' });
    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'po_done', notify_token: 'tok_po_done' }),
    ).resolves.toMatchObject({ ok: true, outcome: 'already' });
    expect(cinetpay.checkTransfer).not.toHaveBeenCalled();
  });

  it('accepte le jeton porté par l’en-tête x-token', async () => {
    await seedPayoutTx('po_hdr');
    cinetpay.checkTransfer.mockResolvedValue({ accepted: true, rejected: false, status: 'VAL', code: '00', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });
    await expect(
      payout.handleCinetpayPayoutWebhook({ client_transaction_id: 'po_hdr' }, 'tok_po_hdr'),
    ).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
  });
});

describe('reconcileCinetpayPayouts', () => {
  it('ne considère que les transferts en attente hors fenêtre de grâce', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    await seedPayoutTx('po_rec_old', { created_at: old });
    await seedPayoutTx('po_rec_fresh'); // trop récent → ignoré
    cinetpay.checkTransfer.mockResolvedValue({ accepted: true, rejected: false, status: 'VAL', code: '00', raw: {} });
    vi.mocked(callProcedure).mockResolvedValue({ success: true, code: 'ok', user_id: UID, credits: 1000 });

    const out = await payout.reconcileCinetpayPayouts();
    expect(out.checked).toBe(1);
    expect(out.confirmed).toBe(1);
    expect(cinetpay.checkTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'po_rec_old' }),
    );
  });

  it('laisse en attente ce que le provider n’a pas tranché', async () => {
    await seedPayoutTx('po_rec_pending', { created_at: new Date(Date.now() - 10 * 60 * 1000) });
    cinetpay.checkTransfer.mockResolvedValue({ accepted: false, rejected: false, status: 'TRANSFER', code: '', raw: {} });
    const out = await payout.reconcileCinetpayPayouts();
    expect(out.stillPending).toBeGreaterThanOrEqual(1);
    expect(callProcedure).not.toHaveBeenCalled();
  });

  it('survit à une erreur provider sans interrompre le lot', async () => {
    await seedPayoutTx('po_rec_err', { created_at: new Date(Date.now() - 10 * 60 * 1000) });
    cinetpay.checkTransfer.mockRejectedValue(new Error('provider down'));
    const out = await payout.reconcileCinetpayPayouts();
    expect(out.checked).toBeGreaterThanOrEqual(1);
    expect(out.confirmed).toBe(0);
  });
});

describe('soldes marchands', () => {
  it('agrège les soldes de chaque pays actif', async () => {
    cinetpay.getBalances.mockResolvedValue({ ok: true, available: 250000, currency: 'XOF', raw: {} });
    const rows = await payout.getCinetpayBalances();
    expect(rows).toHaveLength(2); // CI + CM
    expect(rows[0]).toMatchObject({ ok: true, available: 250000 });
  });

  it('signale un pays illisible sans faire échouer les autres', async () => {
    cinetpay.getBalances
      .mockRejectedValueOnce(new Error('auth failed'))
      .mockResolvedValueOnce({ ok: true, available: 10, currency: 'XAF', raw: {} });
    const rows = await payout.getCinetpayBalances();
    expect(rows.some((r) => r.ok === false)).toBe(true);
    expect(rows.some((r) => r.ok === true)).toBe(true);
  });

  it('lève une alerte sous le seuil configuré', async () => {
    const { config } = await import('../src/config/env.js');
    const saved = config.cinetpay.balanceAlertThreshold;
    config.cinetpay.balanceAlertThreshold = 100000;
    cinetpay.getBalances.mockResolvedValue({ ok: true, available: 500, currency: 'XOF', raw: {} });

    const out = await payout.checkCinetpayBalances();
    expect(out.alerted).toBe(2);
    const alerts = await db.CinetpayAlert.findAll({ where: { event: 'balance_low' } });
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    config.cinetpay.balanceAlertThreshold = saved;
  });

  it('ne surveille rien quand le seuil est nul', async () => {
    await expect(payout.checkCinetpayBalances()).resolves.toEqual({ checked: 0, alerted: 0 });
    expect(cinetpay.getBalances).not.toHaveBeenCalled();
  });
});
