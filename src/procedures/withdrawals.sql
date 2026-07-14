-- ============================================================================
-- Atomic withdrawal procedures (MySQL 8) — port of the Supabase payout reserve/
-- revert RPCs. A withdrawal RESERVES funds by debiting the wallet up-front
-- (`reserve_withdrawal`); if it is later rejected the funds are RETURNED
-- (`revert_withdrawal`). Both use the conditional check-and-debit pattern inside
-- an explicit transaction. `revert_withdrawal` is idempotent: a request already
-- rejected/refunded/completed is a safe no-op.
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40). Statements are
-- separated by the `-- @sep` marker (see scripts/apply-procedures.js).
-- ============================================================================

DROP PROCEDURE IF EXISTS reserve_withdrawal;
-- @sep
CREATE PROCEDURE reserve_withdrawal(
  IN  p_user_id  CHAR(36),
  IN  p_amount   DECIMAL(18,2),
  IN  p_method   VARCHAR(30),
  IN  p_details  JSON,
  IN  p_provider VARCHAR(30),
  IN  p_status   VARCHAR(20),
  IN  p_auto     BOOLEAN,
  OUT p_success  BOOLEAN,
  OUT p_code     VARCHAR(40),
  OUT p_id       CHAR(36)
)
proc: BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_id = NULL;
  IF p_amount IS NULL OR p_amount <= 0 THEN SET p_code = 'invalid_amount'; LEAVE proc; END IF;

  START TRANSACTION;
  UPDATE user_wallets SET balance = balance - p_amount, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_user_id AND balance >= p_amount;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  SET p_id = UUID();
  INSERT INTO withdrawal_requests
    (id, user_id, amount, payment_method, payment_details, status, provider, auto_processed, created_at)
  VALUES
    (p_id, p_user_id, p_amount, p_method, p_details, p_status, NULLIF(p_provider, ''), p_auto, UTC_TIMESTAMP());

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
DROP PROCEDURE IF EXISTS revert_withdrawal;
-- @sep
CREATE PROCEDURE revert_withdrawal(
  IN  p_id           CHAR(36),
  IN  p_processed_by CHAR(36),
  OUT p_success      BOOLEAN,
  OUT p_code         VARCHAR(40)
)
proc: BEGIN
  DECLARE v_user   CHAR(36);
  DECLARE v_amount DECIMAL(18,2);
  DECLARE v_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error';

  START TRANSACTION;
  SELECT user_id, amount, status INTO v_user, v_amount, v_status
    FROM withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF v_user IS NULL THEN SET p_code = 'not_found'; ROLLBACK; LEAVE proc; END IF;
  IF v_status IN ('rejected', 'refunded', 'completed') THEN
    SET p_success = TRUE; SET p_code = 'already'; COMMIT; LEAVE proc;
  END IF;

  UPDATE user_wallets SET balance = balance + v_amount, updated_at = UTC_TIMESTAMP() WHERE user_id = v_user;
  UPDATE withdrawal_requests SET status = 'rejected', processed_by = p_processed_by, processed_at = UTC_TIMESTAMP()
    WHERE id = p_id;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
