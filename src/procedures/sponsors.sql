-- ============================================================================
-- Atomic sponsor procedures (MySQL 8).
--
-- `pay_sponsor_from_wallet` debits the requester's wallet for a sponsor
-- request's `price_credits` using the same conditional check-and-debit pattern
-- as the wallet procedures (`UPDATE ... WHERE balance >= amount` inside an
-- explicit transaction). Idempotent: a request already `paid_at` returns
-- ok/'already_paid' without double-charging.
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40). Statements are
-- separated by the `-- @sep` marker (see scripts/apply-procedures.js).
-- ============================================================================

DROP PROCEDURE IF EXISTS pay_sponsor_from_wallet;
-- @sep
CREATE PROCEDURE pay_sponsor_from_wallet(
  IN  p_user_id    CHAR(36),
  IN  p_request_id CHAR(36),
  OUT p_success    BOOLEAN,
  OUT p_code       VARCHAR(40)
)
proc: BEGIN
  DECLARE v_price  DECIMAL(18,2);
  DECLARE v_paid   DATETIME;
  DECLARE v_owner  CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error';

  START TRANSACTION;
  SELECT price_credits, paid_at, requester_id
    INTO v_price, v_paid, v_owner
    FROM sponsor_requests WHERE id = p_request_id FOR UPDATE;

  IF v_price IS NULL THEN SET p_code = 'request_not_found'; ROLLBACK; LEAVE proc; END IF;
  IF v_owner <> p_user_id THEN SET p_code = 'forbidden'; ROLLBACK; LEAVE proc; END IF;
  IF v_paid IS NOT NULL THEN SET p_success = TRUE; SET p_code = 'already_paid'; COMMIT; LEAVE proc; END IF;
  IF v_price <= 0 THEN
    UPDATE sponsor_requests SET paid_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = p_request_id;
    COMMIT; SET p_success = TRUE; SET p_code = 'ok'; LEAVE proc;
  END IF;

  UPDATE user_wallets SET balance = balance - v_price, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_user_id AND balance >= v_price;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  UPDATE sponsor_requests SET paid_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = p_request_id;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
