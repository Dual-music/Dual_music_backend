-- ============================================================================
-- Concert/live dedication payment flow (MySQL 8).
--
-- Two-phase flow: a request never charges the fan by itself — it only creates
-- a 'pending' row. The fan is ONLY debited when the ARTIST ACCEPTS (atomic:
-- debit fan + credit artist + revenue split, all in one transaction, exactly
-- like the OLD single-shot flow did at request time). A REJECTED request never
-- touches any wallet. This avoids ever showing a fan a stale balance for money
-- they were never actually charged (or reversing a charge on rejection).
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40). Statements are
-- separated by the `-- @sep` marker.
-- ============================================================================

DROP PROCEDURE IF EXISTS purchase_concert_dedication_from_wallet;
-- @sep
-- Creates a PENDING dedication request. No wallet touched — validation
-- (message, min price, artist resolution, allows_dedications) is done in the
-- service before calling. `p_platform_pct` kept as a parameter for call-site
-- compatibility (unused here now — the split happens at accept time instead).
CREATE PROCEDURE purchase_concert_dedication_from_wallet(
  IN  p_fan           CHAR(36),
  IN  p_concert_id    CHAR(36),
  IN  p_concert_type  VARCHAR(30),
  IN  p_artist        CHAR(36),
  IN  p_message       TEXT,
  IN  p_price         DECIMAL(18,2),
  IN  p_platform_pct  DECIMAL(6,2),
  OUT p_success       BOOLEAN,
  OUT p_code          VARCHAR(40),
  OUT p_dedication_id CHAR(36)
)
proc: BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_dedication_id = NULL;
  IF p_price <= 0 THEN SET p_code = 'invalid_price'; LEAVE proc; END IF;

  START TRANSACTION;
  SET p_dedication_id = UUID();
  INSERT INTO concert_dedications
    (id, concert_id, concert_type, artist_id, fan_id, message, price_credits, status, created_at)
  VALUES
    (p_dedication_id, p_concert_id, p_concert_type, p_artist, p_fan, p_message, p_price, 'pending', UTC_TIMESTAMP());
  COMMIT;

  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep

DROP PROCEDURE IF EXISTS accept_concert_dedication_from_wallet;
-- @sep
-- Artist ACCEPTS a pending dedication: locks the row, debits the fan NOW,
-- splits revenue (platform % + artist), credits the artist, marks 'paid'.
-- Mirrors the OLD purchase procedure's charge logic, just moved to this step.
CREATE PROCEDURE accept_concert_dedication_from_wallet(
  IN  p_dedication_id CHAR(36),
  IN  p_platform_pct  DECIMAL(6,2),
  OUT p_success       BOOLEAN,
  OUT p_code          VARCHAR(40)
)
proc: BEGIN
  DECLARE v_fan CHAR(36);
  DECLARE v_artist CHAR(36);
  DECLARE v_price DECIMAL(18,2);
  DECLARE v_status VARCHAR(20);
  DECLARE v_platform DECIMAL(18,2);
  DECLARE v_artist_credits DECIMAL(18,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error';

  START TRANSACTION;
  SELECT fan_id, artist_id, price_credits, status INTO v_fan, v_artist, v_price, v_status
    FROM concert_dedications WHERE id = p_dedication_id FOR UPDATE;
  IF v_fan IS NULL THEN SET p_code = 'not_found'; ROLLBACK; LEAVE proc; END IF;
  IF v_status != 'pending' THEN SET p_code = 'not_pending'; ROLLBACK; LEAVE proc; END IF;

  UPDATE user_wallets SET balance = balance - v_price, updated_at = UTC_TIMESTAMP()
    WHERE user_id = v_fan AND balance >= v_price;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  UPDATE concert_dedications SET status = 'paid', paid_at = UTC_TIMESTAMP() WHERE id = p_dedication_id;

  SET v_platform = ROUND(v_price * p_platform_pct / 100, 2);
  SET v_artist_credits = v_price - v_platform;
  INSERT INTO revenue_distributions
    (id, source_type, source_id, payer_id, total_credits, platform_credits,
     artist1_id, artist1_credits, artist2_credits, manager_credits, created_at)
  VALUES
    (UUID(), 'dedication', p_dedication_id, v_fan, v_price, v_platform,
     v_artist, v_artist_credits, 0, 0, UTC_TIMESTAMP());

  INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (v_artist, v_artist_credits, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE balance = balance + v_artist_credits, updated_at = UTC_TIMESTAMP();

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
