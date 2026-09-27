-- ============================================================================
-- Atomic CinetPay **payout (transfer)** procedures (MySQL 8).
--
-- Money model — les fonds sont DÉJÀ réservés : `reserve_withdrawal` a débité le
-- portefeuille au moment de la demande. Ces procédures ne débitent donc jamais ;
-- elles pilotent la machine à états et **remboursent** en cas d'échec définitif.
--
--   withdrawal_requests : pending|approved → processing → completed | failed
--   cinetpay_transactions (kind='payout') : pending → success | failed
--
-- `processing` est l'état pivot : il empêche qu'un même retrait soit soumis deux
-- fois au provider (deux admins, double-clic, rejeu de job) et distingue « ordre
-- émis » de « argent versé ». Seul le webhook (ou la réconciliation) écrit l'état
-- final.
--
-- Toutes sont idempotentes et verrouillent leur ligne (`FOR UPDATE`).
-- Convention : OUT p_success BOOLEAN, OUT p_code VARCHAR(40).
-- Statements séparés par `-- @sep` (voir scripts/apply-procedures.js).
-- ============================================================================

DROP PROCEDURE IF EXISTS cinetpay_start_payout;
-- @sep
CREATE PROCEDURE cinetpay_start_payout(
  IN  p_withdrawal_id CHAR(36),
  IN  p_merchant_id   CHAR(64),
  IN  p_country       VARCHAR(4),
  IN  p_method        VARCHAR(32),
  IN  p_amount        DECIMAL(18,2),
  IN  p_currency      VARCHAR(10),
  IN  p_phone         VARCHAR(32),
  IN  p_notify_token  CHAR(64),
  OUT p_success       BOOLEAN,
  OUT p_code          VARCHAR(40),
  OUT p_user_id       CHAR(36),
  OUT p_credits       DECIMAL(18,2)
)
proc: BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_user_id = NULL; SET p_credits = NULL;

  START TRANSACTION;
  SELECT user_id, amount, status INTO p_user_id, p_credits, v_status
    FROM withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;

  IF p_user_id IS NULL THEN
    SET p_code = 'not_found'; ROLLBACK; LEAVE proc;
  END IF;

  -- Seule une demande dont les fonds sont réservés et non encore soumise au
  -- provider peut partir en transfert.
  IF v_status NOT IN ('pending', 'approved') THEN
    SET p_code = CONCAT('not_payable:', v_status); ROLLBACK; LEAVE proc;
  END IF;

  INSERT INTO cinetpay_transactions
    (id, merchant_transaction_id, kind, user_id, country_code, payment_method,
     amount, currency, phone_number, status, notify_token, credits_amount,
     withdrawal_request_id, created_at, updated_at)
  VALUES
    (UUID(), p_merchant_id, 'payout', p_user_id, p_country, p_method,
     p_amount, p_currency, p_phone, 'pending', p_notify_token, p_credits,
     p_withdrawal_id, UTC_TIMESTAMP(), UTC_TIMESTAMP());

  UPDATE withdrawal_requests
    SET status = 'processing', provider = 'cinetpay', provider_tx_id = p_merchant_id
    WHERE id = p_withdrawal_id;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
DROP PROCEDURE IF EXISTS cinetpay_confirm_payout;
-- @sep
CREATE PROCEDURE cinetpay_confirm_payout(
  IN  p_merchant_id CHAR(64),
  OUT p_success     BOOLEAN,
  OUT p_code        VARCHAR(40),
  OUT p_user_id     CHAR(36),
  OUT p_credits     DECIMAL(18,2)
)
proc: BEGIN
  DECLARE v_id CHAR(36); DECLARE v_status VARCHAR(20); DECLARE v_withdrawal CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_user_id = NULL; SET p_credits = NULL;

  START TRANSACTION;
  SELECT id, status, user_id, credits_amount, withdrawal_request_id
    INTO v_id, v_status, p_user_id, p_credits, v_withdrawal
    FROM cinetpay_transactions
    WHERE merchant_transaction_id = p_merchant_id AND kind = 'payout' FOR UPDATE;

  IF v_id IS NULL THEN SET p_code = 'tx_not_found'; ROLLBACK; LEAVE proc; END IF;

  IF v_status = 'success' THEN
    SET p_success = TRUE; SET p_code = 'already'; COMMIT; LEAVE proc;
  END IF;

  -- Un transfert déjà remboursé ne peut pas être confirmé : les crédits sont
  -- retournés au portefeuille, confirmer ici paierait deux fois.
  IF v_status = 'failed' THEN
    SET p_code = 'already_reverted'; ROLLBACK; LEAVE proc;
  END IF;

  UPDATE cinetpay_transactions
    SET status = 'success', processed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
    WHERE id = v_id;

  IF v_withdrawal IS NOT NULL THEN
    UPDATE withdrawal_requests
      SET status = 'completed', processed_at = UTC_TIMESTAMP()
      WHERE id = v_withdrawal;
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
DROP PROCEDURE IF EXISTS cinetpay_revert_payout;
-- @sep
CREATE PROCEDURE cinetpay_revert_payout(
  IN  p_merchant_id CHAR(64),
  IN  p_reason      VARCHAR(500),
  OUT p_success     BOOLEAN,
  OUT p_code        VARCHAR(40),
  OUT p_user_id     CHAR(36),
  OUT p_credits     DECIMAL(18,2)
)
proc: BEGIN
  DECLARE v_id CHAR(36); DECLARE v_status VARCHAR(20); DECLARE v_withdrawal CHAR(36);
  DECLARE v_wstatus VARCHAR(20); DECLARE v_refund DECIMAL(18,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_user_id = NULL; SET p_credits = NULL;

  START TRANSACTION;
  SELECT id, status, user_id, credits_amount, withdrawal_request_id
    INTO v_id, v_status, p_user_id, p_credits, v_withdrawal
    FROM cinetpay_transactions
    WHERE merchant_transaction_id = p_merchant_id AND kind = 'payout' FOR UPDATE;

  IF v_id IS NULL THEN SET p_code = 'tx_not_found'; ROLLBACK; LEAVE proc; END IF;

  IF v_status = 'failed' THEN
    SET p_success = TRUE; SET p_code = 'already'; COMMIT; LEAVE proc;
  END IF;

  -- Refuser de rembourser un transfert validé : ce serait rendre les crédits ET
  -- avoir versé l'argent. Ce cas signale une incohérence à traiter à la main.
  IF v_status = 'success' THEN
    SET p_code = 'already_settled'; ROLLBACK; LEAVE proc;
  END IF;

  UPDATE cinetpay_transactions
    SET status = 'failed', error_message = p_reason,
        processed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
    WHERE id = v_id;

  IF v_withdrawal IS NOT NULL THEN
    SELECT status, amount INTO v_wstatus, v_refund
      FROM withdrawal_requests WHERE id = v_withdrawal FOR UPDATE;

    -- Ne recréditer que si la demande porte encore les fonds réservés. Si un
    -- admin l'a déjà rejetée (`revert_withdrawal`), le remboursement a eu lieu.
    IF v_wstatus IN ('pending', 'approved', 'processing') THEN
      UPDATE user_wallets SET balance = balance + v_refund, updated_at = UTC_TIMESTAMP()
        WHERE user_id = p_user_id;
      UPDATE withdrawal_requests
        SET status = 'failed', processed_at = UTC_TIMESTAMP()
        WHERE id = v_withdrawal;
      SET p_credits = v_refund;
    ELSE
      SET p_credits = 0;
    END IF;
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
-- cinetpay_fail_payin — clôt un PayIn non encaissé sans toucher au portefeuille.
-- Sans elle une transaction refusée resterait `pending` indéfiniment et serait
-- rejouée à chaque passage du job de réconciliation.
DROP PROCEDURE IF EXISTS cinetpay_fail_payin;
-- @sep
CREATE PROCEDURE cinetpay_fail_payin(
  IN  p_merchant_id CHAR(64),
  IN  p_status      VARCHAR(20),
  IN  p_reason      VARCHAR(500),
  OUT p_success     BOOLEAN,
  OUT p_code        VARCHAR(40)
)
proc: BEGIN
  DECLARE v_id CHAR(36); DECLARE v_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error';

  START TRANSACTION;
  SELECT id, status INTO v_id, v_status
    FROM cinetpay_transactions
    WHERE merchant_transaction_id = p_merchant_id AND kind = 'payin' FOR UPDATE;

  IF v_id IS NULL THEN SET p_code = 'tx_not_found'; ROLLBACK; LEAVE proc; END IF;

  -- Ne jamais déclasser une transaction déjà encaissée.
  IF v_status = 'success' THEN
    SET p_success = TRUE; SET p_code = 'already_settled'; COMMIT; LEAVE proc;
  END IF;

  UPDATE cinetpay_transactions
    SET status = p_status, error_message = p_reason,
        processed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
    WHERE id = v_id;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
