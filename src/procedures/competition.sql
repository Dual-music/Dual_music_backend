-- ============================================================================
-- Competition credit procedures (MySQL 8) — atomic ports of the Supabase
-- competition RPCs that move credits: paid votes, gifts and viewer tickets.
-- Each locks the payer wallet (conditional debit), records the row and updates
-- the candidate's running tallies used for the final ranking.
-- Statements separated by `-- @sep`.
-- ============================================================================

DROP PROCEDURE IF EXISTS competition_vote;
-- @sep
-- vote_for_competition_candidate — debits credits and records a candidate vote.
CREATE PROCEDURE competition_vote(
  IN  p_voter     CHAR(36),
  IN  p_comp      CHAR(36),
  IN  p_candidate CHAR(36),
  IN  p_credits   DECIMAL(18,2),
  OUT p_success   BOOLEAN,
  OUT p_code      VARCHAR(40)
)
proc: BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  SET p_success = FALSE; SET p_code = 'error';
  IF p_credits IS NULL OR p_credits <= 0 THEN SET p_code = 'invalid_amount'; LEAVE proc; END IF;

  START TRANSACTION;
  UPDATE user_wallets SET balance = balance - p_credits, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_voter AND balance >= p_credits;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  INSERT INTO competition_votes (id, competition_id, candidate_id, voter_id, credits_spent, created_at)
    VALUES (UUID(), p_comp, p_candidate, p_voter, p_credits, UTC_TIMESTAMP());
  UPDATE competition_candidates SET total_votes = COALESCE(total_votes, 0) + p_credits, updated_at = UTC_TIMESTAMP()
    WHERE id = p_candidate AND competition_id = p_comp;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
DROP PROCEDURE IF EXISTS send_competition_gift;
-- @sep
-- send_competition_gift — debits credits and records a gift to either a
-- candidate (updates the candidate's ranking tally, no wallet distribution —
-- the pool is settled at finalize) OR the competition manager (an in-person
-- tip: distributed through the revenue engine so the manager is credited,
-- minus the platform cut). Exactly one of p_candidate / p_recipient_user is set.
CREATE PROCEDURE send_competition_gift(
  IN  p_sender         CHAR(36),
  IN  p_comp           CHAR(36),
  IN  p_candidate      CHAR(36),
  IN  p_gift_id        CHAR(36),
  IN  p_credits        DECIMAL(18,2),
  IN  p_recipient_user CHAR(36),
  OUT p_success        BOOLEAN,
  OUT p_code           VARCHAR(40)
)
proc: BEGIN
  DECLARE v_dist CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  SET p_success = FALSE; SET p_code = 'error';
  IF p_credits IS NULL OR p_credits <= 0 THEN SET p_code = 'invalid_amount'; LEAVE proc; END IF;
  IF p_candidate IS NULL AND p_recipient_user IS NULL THEN SET p_code = 'invalid_recipient'; LEAVE proc; END IF;

  START TRANSACTION;
  UPDATE user_wallets SET balance = balance - p_credits, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_sender AND balance >= p_credits;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  INSERT INTO competition_gifts (id, competition_id, candidate_id, recipient_user_id, sender_id, gift_id, credits, created_at)
    VALUES (UUID(), p_comp, p_candidate, p_recipient_user, p_sender, p_gift_id, p_credits, UTC_TIMESTAMP());

  IF p_candidate IS NOT NULL THEN
    UPDATE competition_candidates SET total_gifts_credits = COALESCE(total_gifts_credits, 0) + p_credits, updated_at = UTC_TIMESTAMP()
      WHERE id = p_candidate AND competition_id = p_comp;
  ELSE
    CALL distribute_event_revenue('gift_competition', p_comp, p_sender, p_credits,
      p_recipient_user, NULL, NULL, NULL, JSON_OBJECT('gift_id', p_gift_id), v_dist);
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
DROP PROCEDURE IF EXISTS purchase_competition_ticket;
-- @sep
-- purchase_competition_ticket — buys a viewer ticket (one per user, atomic).
CREATE PROCEDURE purchase_competition_ticket(
  IN  p_user   CHAR(36),
  IN  p_comp   CHAR(36),
  IN  p_amount DECIMAL(18,2),
  OUT p_success BOOLEAN,
  OUT p_code    VARCHAR(40),
  OUT p_ticket  CHAR(36)
)
proc: BEGIN
  DECLARE v_existing CHAR(36); DECLARE v_id CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  SET p_success = FALSE; SET p_code = 'error'; SET p_ticket = NULL;

  START TRANSACTION;
  SELECT id INTO v_existing FROM competition_tickets WHERE competition_id = p_comp AND user_id = p_user LIMIT 1;
  IF v_existing IS NOT NULL THEN SET p_code = 'already_purchased'; ROLLBACK; LEAVE proc; END IF;

  IF p_amount > 0 THEN
    UPDATE user_wallets SET balance = balance - p_amount, updated_at = UTC_TIMESTAMP()
      WHERE user_id = p_user AND balance >= p_amount;
    IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;
  END IF;

  SET v_id = UUID();
  INSERT INTO competition_tickets (id, competition_id, user_id, amount_paid, paid_at)
    VALUES (v_id, p_comp, p_user, COALESCE(p_amount, 0), UTC_TIMESTAMP());

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok'; SET p_ticket = v_id;
END;
