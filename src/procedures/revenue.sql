-- ============================================================================
-- Revenue distribution engine (MySQL 8) — faithful port of the Supabase
-- `distribute_event_revenue` RPC. Splits a credit amount between the platform,
-- artist(s) and manager according to the JSON `economic_config` platform
-- setting, records a `revenue_distributions` row, and credits recipient
-- wallets atomically. Called by every paid flow (votes, gifts, tickets,
-- replays, sponsors).
--
-- Statements separated by `-- @sep`.
-- ============================================================================

DROP FUNCTION IF EXISTS fn_has_role;
-- @sep
-- fn_has_role — mirrors public.has_role(role, user_id): true when the user holds
-- the given role in user_roles.
CREATE FUNCTION fn_has_role(p_user_id CHAR(36), p_role VARCHAR(20))
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = p_role) INTO v_exists;
  RETURN v_exists = 1;
END;
-- @sep
DROP PROCEDURE IF EXISTS distribute_event_revenue;
-- @sep
-- distribute_event_revenue — splits p_total_credits per economic_config and
-- credits recipient wallets. Returns the created distribution id in p_dist_id
-- (NULL when nothing was distributed). Assumes the caller already opened a
-- transaction and deducted the payer.
CREATE PROCEDURE distribute_event_revenue(
  IN  p_source_type   VARCHAR(40),
  IN  p_source_id     CHAR(36),
  IN  p_payer_id      CHAR(36),
  IN  p_total_credits DECIMAL(18,2),
  IN  p_artist1_id    CHAR(36),
  IN  p_artist2_id    CHAR(36),
  IN  p_manager_id    CHAR(36),
  IN  p_winner_id     CHAR(36),
  IN  p_metadata      JSON,
  OUT p_dist_id       CHAR(36)
)
proc: BEGIN
  DECLARE v_config JSON;
  DECLARE v_section JSON;
  DECLARE v_key VARCHAR(40);
  DECLARE v_enabled BOOLEAN DEFAULT TRUE;
  DECLARE v_platform_pct DECIMAL(9,4) DEFAULT 0;
  DECLARE v_artist_pct DECIMAL(9,4) DEFAULT 0;
  DECLARE v_artists_pct DECIMAL(9,4) DEFAULT 0;
  DECLARE v_manager_pct DECIMAL(9,4) DEFAULT 0;
  DECLARE v_winner_share_pct DECIMAL(9,4) DEFAULT 50;
  DECLARE v_platform DECIMAL(18,2) DEFAULT 0;
  DECLARE v_artist1 DECIMAL(18,2) DEFAULT 0;
  DECLARE v_artist2 DECIMAL(18,2) DEFAULT 0;
  DECLARE v_manager DECIMAL(18,2) DEFAULT 0;
  DECLARE v_artists_pool DECIMAL(18,2) DEFAULT 0;
  DECLARE v_after_platform DECIMAL(18,2) DEFAULT 0;
  DECLARE v_simple BOOLEAN DEFAULT FALSE;
  DECLARE v_new_id CHAR(36);

  SET p_dist_id = NULL;
  IF p_total_credits IS NULL OR p_total_credits <= 0 THEN LEAVE proc; END IF;

  SELECT `value` INTO v_config FROM platform_settings WHERE `key` = 'economic_config';
  IF v_config IS NULL THEN LEAVE proc; END IF;

  SET v_key = CASE p_source_type
    WHEN 'concert_ticket'  THEN 'concert_ticket'
    WHEN 'concert_replay'  THEN 'concert_replay'
    WHEN 'duel_ticket'     THEN 'duel_ticket'
    WHEN 'duel_replay'     THEN 'duel_replay'
    WHEN 'gift_concert'    THEN 'gift'
    WHEN 'gift_duel'       THEN 'gift'
    WHEN 'gift_live'       THEN 'gift'
    WHEN 'gift_competition' THEN 'gift'
    WHEN 'vote'            THEN 'vote'
    WHEN 'sponsor_concert' THEN 'sponsor_concert'
    WHEN 'sponsor_duel'    THEN 'sponsor_duel'
    ELSE NULL
  END;
  IF v_key IS NULL THEN LEAVE proc; END IF;

  SET v_section = JSON_EXTRACT(v_config, CONCAT('$.', v_key));
  IF v_section IS NULL OR JSON_TYPE(v_section) = 'NULL' THEN LEAVE proc; END IF;

  SET v_new_id = UUID();

  -- Sponsor sections may be disabled → 100% platform.
  IF p_source_type IN ('sponsor_concert', 'sponsor_duel') THEN
    SET v_enabled = COALESCE(JSON_EXTRACT(v_section, '$.enabled') = TRUE, FALSE);
    IF NOT v_enabled THEN
      SET v_platform = p_total_credits;
      INSERT INTO revenue_distributions
        (id, source_type, source_id, payer_id, total_credits, platform_credits,
         artist1_id, artist1_credits, artist2_id, artist2_credits, manager_id, manager_credits, metadata, created_at)
      VALUES
        (v_new_id, p_source_type, p_source_id, p_payer_id, p_total_credits, v_platform,
         NULL, 0, NULL, 0, NULL, 0, p_metadata, UTC_TIMESTAMP());
      SET p_dist_id = v_new_id;
      LEAVE proc;
    END IF;
  END IF;

  SET v_platform_pct     = COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(v_section, '$.platform_pct')) AS DECIMAL(9,4)), 0);
  SET v_artist_pct       = COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(v_section, '$.artist_pct')) AS DECIMAL(9,4)), 0);
  SET v_artists_pct      = COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(v_section, '$.artists_pct')) AS DECIMAL(9,4)), 0);
  SET v_manager_pct      = COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(v_section, '$.manager_pct')) AS DECIMAL(9,4)), 0);
  SET v_winner_share_pct = COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(v_section, '$.winner_share_pct')) AS DECIMAL(9,4)), 50);

  SET v_simple = p_source_type IN ('gift_concert', 'gift_duel', 'gift_live', 'gift_competition', 'vote');
  SET v_platform = ROUND(p_total_credits * v_platform_pct / 100, 2);

  IF v_simple THEN
    SET v_after_platform = p_total_credits - v_platform;
    IF p_artist1_id IS NOT NULL THEN
      IF fn_has_role(p_artist1_id, 'manager') THEN
        -- Recipient is a manager: whole remainder to them, recorded as manager.
        SET v_manager = v_after_platform;
        INSERT INTO revenue_distributions
          (id, source_type, source_id, payer_id, total_credits, platform_credits,
           artist1_id, artist1_credits, artist2_id, artist2_credits, manager_id, manager_credits, metadata, created_at)
        VALUES
          (v_new_id, p_source_type, p_source_id, p_payer_id, p_total_credits, v_platform,
           NULL, 0, NULL, 0, p_artist1_id, v_manager, p_metadata, UTC_TIMESTAMP());
        INSERT INTO user_wallets (user_id, balance, updated_at)
          VALUES (p_artist1_id, v_manager, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE balance = balance + v_manager, updated_at = UTC_TIMESTAMP();
        SET p_dist_id = v_new_id;
        LEAVE proc;
      ELSE
        SET v_artist1 = v_after_platform;
      END IF;
    END IF;
  ELSE
    SET v_manager = ROUND(p_total_credits * v_manager_pct / 100, 2);
    IF p_artist1_id IS NOT NULL AND p_artist2_id IS NULL THEN
      SET v_artist1 = ROUND(p_total_credits * (v_artist_pct + v_artists_pct) / 100, 2);
    END IF;
    IF p_artist1_id IS NOT NULL AND p_artist2_id IS NOT NULL THEN
      SET v_artists_pool = ROUND(p_total_credits * v_artists_pct / 100, 2);
      IF p_winner_id IS NOT NULL AND p_winner_id IN (p_artist1_id, p_artist2_id) THEN
        IF p_winner_id = p_artist1_id THEN
          SET v_artist1 = ROUND(v_artists_pool * v_winner_share_pct / 100, 2);
          SET v_artist2 = v_artists_pool - v_artist1;
        ELSE
          SET v_artist2 = ROUND(v_artists_pool * v_winner_share_pct / 100, 2);
          SET v_artist1 = v_artists_pool - v_artist2;
        END IF;
      ELSE
        SET v_artist1 = ROUND(v_artists_pool / 2, 2);
        SET v_artist2 = v_artists_pool - v_artist1;
      END IF;
    END IF;
  END IF;

  INSERT INTO revenue_distributions
    (id, source_type, source_id, payer_id, total_credits, platform_credits,
     artist1_id, artist1_credits, artist2_id, artist2_credits, manager_id, manager_credits, metadata, created_at)
  VALUES
    (v_new_id, p_source_type, p_source_id, p_payer_id, p_total_credits, v_platform,
     p_artist1_id, v_artist1, p_artist2_id, v_artist2,
     CASE WHEN v_manager > 0 THEN p_manager_id ELSE NULL END, v_manager, p_metadata, UTC_TIMESTAMP());

  IF p_artist1_id IS NOT NULL AND v_artist1 > 0 THEN
    INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (p_artist1_id, v_artist1, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE balance = balance + v_artist1, updated_at = UTC_TIMESTAMP();
  END IF;
  IF p_artist2_id IS NOT NULL AND v_artist2 > 0 THEN
    INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (p_artist2_id, v_artist2, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE balance = balance + v_artist2, updated_at = UTC_TIMESTAMP();
  END IF;
  IF p_manager_id IS NOT NULL AND v_manager > 0 THEN
    INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (p_manager_id, v_manager, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE balance = balance + v_manager, updated_at = UTC_TIMESTAMP();
  END IF;

  SET p_dist_id = v_new_id;
END;
