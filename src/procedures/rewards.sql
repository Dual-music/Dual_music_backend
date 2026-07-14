-- ============================================================================
-- Atomic season-reward distribution (MySQL 8) — port of the Supabase
-- `distribute_season_reward` RPC. Reads the reward tier for the winner's rank,
-- then: credits → wallet, virtual_gift → inventory (mark 'received'); physical/
-- mystery → mark 'distributed' (handled later via the meeting workflow). All in
-- one transaction.
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40). Statements are
-- separated by the `-- @sep` marker.
-- ============================================================================

DROP PROCEDURE IF EXISTS distribute_season_reward;
-- @sep
CREATE PROCEDURE distribute_season_reward(
  IN  p_winner_id  CHAR(36),
  OUT p_success    BOOLEAN,
  OUT p_code       VARCHAR(40),
  OUT p_reward_type VARCHAR(30),
  OUT p_user_id    CHAR(36)
)
proc: BEGIN
  DECLARE v_user CHAR(36); DECLARE v_season CHAR(36); DECLARE v_rank INT;
  DECLARE v_rtype VARCHAR(30); DECLARE v_credits DECIMAL(18,2); DECLARE v_gift CHAR(36);
  DECLARE v_existing INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_reward_type = NULL; SET p_user_id = NULL;

  START TRANSACTION;
  SELECT user_id, season_id, rank_position INTO v_user, v_season, v_rank
    FROM season_winners WHERE id = p_winner_id FOR UPDATE;
  IF v_user IS NULL THEN SET p_code = 'not_found'; ROLLBACK; LEAVE proc; END IF;

  SELECT reward_type, credits_amount, virtual_gift_id INTO v_rtype, v_credits, v_gift
    FROM leaderboard_rewards WHERE season_id = v_season AND rank_position = v_rank LIMIT 1;
  IF v_rtype IS NULL THEN SET p_code = 'no_reward_defined'; ROLLBACK; LEAVE proc; END IF;
  SET p_reward_type = v_rtype; SET p_user_id = v_user;

  IF v_rtype = 'credits' AND COALESCE(v_credits, 0) > 0 THEN
    INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (v_user, v_credits, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE balance = balance + v_credits, updated_at = UTC_TIMESTAMP();
    UPDATE season_winners SET reward_status = 'received', distributed_at = UTC_TIMESTAMP(), received_at = UTC_TIMESTAMP()
      WHERE id = p_winner_id;
  ELSEIF v_rtype = 'virtual_gift' AND v_gift IS NOT NULL THEN
    SELECT quantity INTO v_existing FROM user_gifts WHERE user_id = v_user AND gift_id = v_gift;
    IF v_existing IS NULL THEN
      INSERT INTO user_gifts (id, user_id, gift_id, quantity, purchased_at) VALUES (UUID(), v_user, v_gift, 1, UTC_TIMESTAMP());
    ELSE
      UPDATE user_gifts SET quantity = quantity + 1 WHERE user_id = v_user AND gift_id = v_gift;
    END IF;
    UPDATE season_winners SET reward_status = 'received', distributed_at = UTC_TIMESTAMP(), received_at = UTC_TIMESTAMP()
      WHERE id = p_winner_id;
  ELSE
    UPDATE season_winners SET reward_status = 'distributed', distributed_at = UTC_TIMESTAMP() WHERE id = p_winner_id;
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
