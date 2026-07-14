-- ============================================================================
-- Atomic concert/live dedication purchase (MySQL 8) — port of the Supabase
-- `purchase_concert_dedication` RPC. Debits the fan's wallet, records the
-- dedication (status 'paid'), splits revenue (platform % + artist), records the
-- distribution and credits the artist — all in one transaction. Validation
-- (message, min price, artist resolution, allows_dedications) is done in the
-- service before calling.
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40). Statements are
-- separated by the `-- @sep` marker.
-- ============================================================================

DROP PROCEDURE IF EXISTS purchase_concert_dedication_from_wallet;
-- @sep
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
  DECLARE v_platform DECIMAL(18,2);
  DECLARE v_artist_credits DECIMAL(18,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_dedication_id = NULL;
  IF p_price <= 0 THEN SET p_code = 'invalid_price'; LEAVE proc; END IF;

  START TRANSACTION;
  UPDATE user_wallets SET balance = balance - p_price, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_fan AND balance >= p_price;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  SET p_dedication_id = UUID();
  INSERT INTO concert_dedications
    (id, concert_id, concert_type, artist_id, fan_id, message, price_credits, status, paid_at, created_at)
  VALUES
    (p_dedication_id, p_concert_id, p_concert_type, p_artist, p_fan, p_message, p_price, 'paid', UTC_TIMESTAMP(), UTC_TIMESTAMP());

  SET v_platform = ROUND(p_price * p_platform_pct / 100, 2);
  SET v_artist_credits = p_price - v_platform;
  INSERT INTO revenue_distributions
    (id, source_type, source_id, payer_id, total_credits, platform_credits,
     artist1_id, artist1_credits, artist2_credits, manager_credits, created_at)
  VALUES
    (UUID(), 'dedication', p_dedication_id, p_fan, p_price, v_platform,
     p_artist, v_artist_credits, 0, 0, UTC_TIMESTAMP());

  INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (p_artist, v_artist_credits, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE balance = balance + v_artist_credits, updated_at = UTC_TIMESTAMP();

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
