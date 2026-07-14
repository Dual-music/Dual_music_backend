-- ============================================================================
-- Atomic referral procedure (MySQL 8) — port of the Supabase
-- `claim_referral_reward` RPC. Credits the referrer's wallet once per completed
-- referral. The reward amount is passed in (read from `referral_config` by the
-- service) so the payout stays admin-configurable. Idempotent: a referral whose
-- `reward_claimed` is already true is a safe no-op.
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40). Statements are
-- separated by the `-- @sep` marker (see scripts/apply-procedures.js).
-- ============================================================================

DROP PROCEDURE IF EXISTS claim_referral_reward;
-- @sep
CREATE PROCEDURE claim_referral_reward(
  IN  p_referral_id CHAR(36),
  IN  p_user_id     CHAR(36),
  IN  p_reward      DECIMAL(18,2),
  OUT p_success     BOOLEAN,
  OUT p_code        VARCHAR(40)
)
proc: BEGIN
  DECLARE v_status  VARCHAR(20);
  DECLARE v_claimed TINYINT(1);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error';

  START TRANSACTION;
  SELECT status, reward_claimed INTO v_status, v_claimed
    FROM referrals WHERE id = p_referral_id AND referrer_id = p_user_id FOR UPDATE;

  IF v_status IS NULL THEN SET p_code = 'not_found'; ROLLBACK; LEAVE proc; END IF;
  IF v_status <> 'completed' THEN SET p_code = 'not_completed'; ROLLBACK; LEAVE proc; END IF;
  IF v_claimed = 1 THEN SET p_code = 'already_claimed'; ROLLBACK; LEAVE proc; END IF;

  UPDATE referrals SET reward_claimed = TRUE WHERE id = p_referral_id;
  UPDATE user_wallets SET balance = balance + p_reward, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_user_id;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
