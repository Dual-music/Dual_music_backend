-- ============================================================================
-- Wallet-credit procedures for payment settlement (MySQL 8) — faithful ports of
-- the Supabase `cinetpay_credit_wallet` / `moneroo_credit_wallet` RPCs.
--
-- Both are **idempotent by provider transaction status**: replaying a webhook
-- for an already-settled transaction returns `already = TRUE` without
-- double-crediting. Each locks the provider transaction row (`FOR UPDATE`),
-- credits the wallet, marks the transaction settled and appends an immutable
-- `credit_purchases` ledger row — all inside one transaction.
--
-- Statements separated by `-- @sep`.
-- ============================================================================

DROP PROCEDURE IF EXISTS cinetpay_credit_wallet;
-- @sep
CREATE PROCEDURE cinetpay_credit_wallet(
  IN  p_merchant_id CHAR(64),
  IN  p_credits     DECIMAL(18,2),
  OUT p_ok          BOOLEAN,
  OUT p_already     BOOLEAN,
  OUT p_error       VARCHAR(40),
  OUT p_balance     DECIMAL(18,2)
)
proc: BEGIN
  DECLARE v_user CHAR(36); DECLARE v_status VARCHAR(20); DECLARE v_id CHAR(36);
  DECLARE v_amount DECIMAL(18,2); DECLARE v_currency VARCHAR(10);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_ok = FALSE; SET p_already = FALSE; SET p_error = NULL; SET p_balance = NULL;

  START TRANSACTION;
  SELECT id, user_id, status, amount, currency
    INTO v_id, v_user, v_status, v_amount, v_currency
    FROM cinetpay_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF v_id IS NULL THEN SET p_error = 'tx_not_found'; ROLLBACK; LEAVE proc; END IF;

  IF v_status = 'success' THEN SET p_ok = TRUE; SET p_already = TRUE; COMMIT; LEAVE proc; END IF;

  INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (v_user, p_credits, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE balance = balance + p_credits, updated_at = UTC_TIMESTAMP();
  SELECT balance INTO p_balance FROM user_wallets WHERE user_id = v_user;

  UPDATE cinetpay_transactions
    SET status = 'success', credits_amount = p_credits, processed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
    WHERE id = v_id;

  INSERT INTO credit_purchases
    (id, user_id, credits_amount, paid_amount, currency, payment_method, status, payment_reference, created_at)
    VALUES (UUID(), v_user, p_credits, v_amount, v_currency, 'cinetpay', 'completed', p_merchant_id, UTC_TIMESTAMP());

  COMMIT;
  SET p_ok = TRUE;
END;
-- @sep
DROP PROCEDURE IF EXISTS moneroo_credit_wallet;
-- @sep
CREATE PROCEDURE moneroo_credit_wallet(
  IN  p_merchant_id CHAR(64),
  IN  p_credits     DECIMAL(18,2),
  OUT p_ok          BOOLEAN,
  OUT p_already     BOOLEAN,
  OUT p_error       VARCHAR(40),
  OUT p_balance     DECIMAL(18,2)
)
proc: BEGIN
  DECLARE v_user CHAR(36); DECLARE v_status VARCHAR(20); DECLARE v_id CHAR(36);
  DECLARE v_amount DECIMAL(18,2); DECLARE v_currency VARCHAR(10);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_ok = FALSE; SET p_already = FALSE; SET p_error = NULL; SET p_balance = NULL;

  START TRANSACTION;
  SELECT id, user_id, status, amount, currency
    INTO v_id, v_user, v_status, v_amount, v_currency
    FROM moneroo_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF v_id IS NULL THEN SET p_error = 'tx_not_found'; ROLLBACK; LEAVE proc; END IF;

  IF v_status = 'success' THEN SET p_ok = TRUE; SET p_already = TRUE; COMMIT; LEAVE proc; END IF;

  INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (v_user, p_credits, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE balance = balance + p_credits, updated_at = UTC_TIMESTAMP();
  SELECT balance INTO p_balance FROM user_wallets WHERE user_id = v_user;

  UPDATE moneroo_transactions
    SET status = 'success', credits_amount = p_credits, processed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
    WHERE id = v_id;

  INSERT INTO credit_purchases
    (id, user_id, credits_amount, paid_amount, currency, payment_method, status, payment_reference, created_at)
    VALUES (UUID(), v_user, p_credits, v_amount, v_currency, 'moneroo', 'completed', p_merchant_id, UTC_TIMESTAMP());

  COMMIT;
  SET p_ok = TRUE;
END;
-- @sep
-- credit_wallet_stripe — settles a Stripe credit purchase idempotently, keyed by
-- the Stripe session/payment id recorded in credit_purchases.payment_reference.
DROP PROCEDURE IF EXISTS credit_wallet_stripe;
-- @sep
CREATE PROCEDURE credit_wallet_stripe(
  IN  p_user_id   CHAR(36),
  IN  p_reference CHAR(120),
  IN  p_credits   DECIMAL(18,2),
  IN  p_paid      DECIMAL(18,2),
  IN  p_currency  VARCHAR(10),
  OUT p_ok        BOOLEAN,
  OUT p_already   BOOLEAN
)
proc: BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_ok = FALSE; SET p_already = FALSE;
  START TRANSACTION;
  SELECT COUNT(*) INTO v_exists FROM credit_purchases WHERE payment_reference = p_reference;
  IF v_exists > 0 THEN SET p_ok = TRUE; SET p_already = TRUE; COMMIT; LEAVE proc; END IF;

  INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (p_user_id, p_credits, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE balance = balance + p_credits, updated_at = UTC_TIMESTAMP();

  INSERT INTO credit_purchases
    (id, user_id, credits_amount, paid_amount, currency, payment_method, status, payment_reference, created_at)
    VALUES (UUID(), p_user_id, p_credits, p_paid, p_currency, 'stripe', 'completed', p_reference, UTC_TIMESTAMP());

  COMMIT;
  SET p_ok = TRUE;
END;
