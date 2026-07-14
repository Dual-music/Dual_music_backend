-- ============================================================================
-- Atomic wallet procedures (MySQL 8) — faithful ports of the Supabase wallet
-- RPCs. Every credit movement locks the payer's wallet row via the conditional
-- `UPDATE ... WHERE balance >= amount` (atomic check-and-debit) inside an
-- explicit transaction, then records the domain row and delegates revenue
-- splitting to `distribute_event_revenue` (see revenue.sql — applied first).
--
-- Convention: OUT p_success BOOLEAN, OUT p_code VARCHAR(40) ('ok' | machine
-- error), OUT p_entity_id CHAR(36), OUT p_extra VARCHAR(80). Statements are
-- separated by the `-- @sep` marker.
-- ============================================================================

DROP PROCEDURE IF EXISTS deduct_wallet_and_vote;
-- @sep
-- deduct_wallet_and_vote — debits credits, records a paid vote, distributes.
CREATE PROCEDURE deduct_wallet_and_vote(
  IN  p_user_id   CHAR(36),
  IN  p_amount    DECIMAL(18,2),
  IN  p_duel_id   CHAR(36),
  IN  p_artist_id CHAR(36),
  OUT p_success   BOOLEAN
)
proc: BEGIN
  DECLARE v_vote_id CHAR(36);
  DECLARE v_dist CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN LEAVE proc; END IF;

  START TRANSACTION;
  UPDATE user_wallets SET balance = balance - p_amount, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_user_id AND balance >= p_amount;
  IF ROW_COUNT() = 0 THEN ROLLBACK; LEAVE proc; END IF;

  SET v_vote_id = UUID();
  INSERT INTO duel_votes (id, duel_id, user_id, artist_id, amount, created_at)
    VALUES (v_vote_id, p_duel_id, p_user_id, p_artist_id, p_amount, UTC_TIMESTAMP());

  CALL distribute_event_revenue('vote', p_duel_id, p_user_id, p_amount,
    p_artist_id, NULL, NULL, NULL, JSON_OBJECT('vote_id', v_vote_id), v_dist);

  COMMIT;
  SET p_success = TRUE;
END;
-- @sep
DROP PROCEDURE IF EXISTS purchase_gift_from_wallet;
-- @sep
-- purchase_gift_from_wallet — buys N gifts into the user's inventory (no split).
CREATE PROCEDURE purchase_gift_from_wallet(
  IN  p_user_id  CHAR(36),
  IN  p_gift_id  CHAR(36),
  IN  p_quantity INT,
  OUT p_success  BOOLEAN,
  OUT p_code     VARCHAR(40)
)
proc: BEGIN
  DECLARE v_price DECIMAL(18,2);
  DECLARE v_total DECIMAL(18,2);
  DECLARE v_existing INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error';
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100 THEN SET p_code = 'invalid_quantity'; LEAVE proc; END IF;

  START TRANSACTION;
  SELECT price INTO v_price FROM virtual_gifts WHERE id = p_gift_id;
  IF v_price IS NULL THEN SET p_code = 'gift_not_found'; ROLLBACK; LEAVE proc; END IF;
  SET v_total = v_price * p_quantity;

  UPDATE user_wallets SET balance = balance - v_total, updated_at = UTC_TIMESTAMP()
    WHERE user_id = p_user_id AND balance >= v_total;
  IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;

  SELECT quantity INTO v_existing FROM user_gifts WHERE user_id = p_user_id AND gift_id = p_gift_id;
  IF v_existing IS NULL THEN
    INSERT INTO user_gifts (id, user_id, gift_id, quantity, purchased_at)
      VALUES (UUID(), p_user_id, p_gift_id, p_quantity, UTC_TIMESTAMP());
  ELSE
    UPDATE user_gifts SET quantity = quantity + p_quantity WHERE user_id = p_user_id AND gift_id = p_gift_id;
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok';
END;
-- @sep
DROP PROCEDURE IF EXISTS send_gift_with_distribution;
-- @sep
-- send_gift_with_distribution — consumes one inventory gift, records the send,
-- and distributes its credit value to the recipient (and manager for duels).
CREATE PROCEDURE send_gift_with_distribution(
  IN  p_user_id    CHAR(36),
  IN  p_gift_id    CHAR(36),
  IN  p_to_user_id CHAR(36),
  IN  p_duel_id    CHAR(36),
  IN  p_live_id    CHAR(36),
  IN  p_concert_id CHAR(36),
  OUT p_success    BOOLEAN,
  OUT p_code       VARCHAR(40),
  OUT p_entity_id  CHAR(36)
)
proc: BEGIN
  DECLARE v_qty INT;
  DECLARE v_price DECIMAL(18,2);
  DECLARE v_source_type VARCHAR(40);
  DECLARE v_source_id CHAR(36);
  DECLARE v_artist1 CHAR(36);
  DECLARE v_manager CHAR(36);
  DECLARE v_tx_id CHAR(36);
  DECLARE v_dist CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_entity_id = NULL;

  START TRANSACTION;
  SELECT quantity INTO v_qty FROM user_gifts WHERE user_id = p_user_id AND gift_id = p_gift_id FOR UPDATE;
  IF v_qty IS NULL OR v_qty <= 0 THEN SET p_code = 'no_inventory'; ROLLBACK; LEAVE proc; END IF;

  SELECT price INTO v_price FROM virtual_gifts WHERE id = p_gift_id;
  IF v_price IS NULL THEN SET p_code = 'gift_not_found'; ROLLBACK; LEAVE proc; END IF;

  IF v_qty <= 1 THEN
    DELETE FROM user_gifts WHERE user_id = p_user_id AND gift_id = p_gift_id;
  ELSE
    UPDATE user_gifts SET quantity = quantity - 1 WHERE user_id = p_user_id AND gift_id = p_gift_id;
  END IF;

  SET v_tx_id = UUID();
  INSERT INTO gift_transactions (id, from_user_id, to_user_id, gift_id, duel_id, live_id, created_at)
    VALUES (v_tx_id, p_user_id, p_to_user_id, p_gift_id, p_duel_id, p_live_id, UTC_TIMESTAMP());

  IF p_duel_id IS NOT NULL THEN
    SET v_source_type = 'gift_duel'; SET v_source_id = p_duel_id;
    SELECT manager_id INTO v_manager FROM duels WHERE id = p_duel_id;
    SET v_artist1 = p_to_user_id;
  ELSEIF p_live_id IS NOT NULL THEN
    SET v_source_type = 'gift_live'; SET v_source_id = p_live_id; SET v_artist1 = p_to_user_id;
  ELSEIF p_concert_id IS NOT NULL THEN
    SET v_source_type = 'gift_concert'; SET v_source_id = p_concert_id; SET v_artist1 = p_to_user_id;
  ELSE
    SET v_source_type = 'gift_live'; SET v_source_id = p_gift_id; SET v_artist1 = p_to_user_id;
  END IF;

  CALL distribute_event_revenue(v_source_type, v_source_id, p_user_id, v_price,
    v_artist1, NULL, v_manager, NULL, JSON_OBJECT('gift_tx_id', v_tx_id, 'gift_id', p_gift_id), v_dist);

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok'; SET p_entity_id = v_tx_id;
END;
-- @sep
DROP PROCEDURE IF EXISTS purchase_duel_ticket_from_wallet;
-- @sep
-- purchase_duel_ticket_from_wallet — buys a duel ticket, distributes revenue.
CREATE PROCEDURE purchase_duel_ticket_from_wallet(
  IN  p_user_id CHAR(36),
  IN  p_duel_id CHAR(36),
  OUT p_success BOOLEAN,
  OUT p_code    VARCHAR(40),
  OUT p_entity_id CHAR(36)
)
proc: BEGIN
  DECLARE v_price DECIMAL(18,2);
  DECLARE v_a1 CHAR(36); DECLARE v_a2 CHAR(36); DECLARE v_mgr CHAR(36);
  DECLARE v_existing CHAR(36); DECLARE v_ticket CHAR(36); DECLARE v_dist CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_entity_id = NULL;

  START TRANSACTION;
  SELECT ticket_price, artist1_id, artist2_id, manager_id INTO v_price, v_a1, v_a2, v_mgr
    FROM duels WHERE id = p_duel_id;
  IF v_a1 IS NULL AND v_price IS NULL THEN SET p_code = 'duel_not_found'; ROLLBACK; LEAVE proc; END IF;

  SELECT id INTO v_existing FROM duel_tickets WHERE duel_id = p_duel_id AND user_id = p_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN SET p_code = 'already_purchased'; ROLLBACK; LEAVE proc; END IF;

  IF v_price > 0 THEN
    UPDATE user_wallets SET balance = balance - v_price, updated_at = UTC_TIMESTAMP()
      WHERE user_id = p_user_id AND balance >= v_price;
    IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;
  END IF;

  SET v_ticket = UUID();
  INSERT INTO duel_tickets (id, duel_id, user_id, price_paid, purchased_at)
    VALUES (v_ticket, p_duel_id, p_user_id, COALESCE(v_price, 0), UTC_TIMESTAMP());

  IF v_price > 0 THEN
    CALL distribute_event_revenue('duel_ticket', p_duel_id, p_user_id, v_price,
      v_a1, v_a2, v_mgr, NULL, JSON_OBJECT('ticket_id', v_ticket), v_dist);
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok'; SET p_entity_id = v_ticket;
END;
-- @sep
DROP PROCEDURE IF EXISTS purchase_concert_ticket_from_wallet;
-- @sep
-- purchase_concert_ticket_from_wallet — buys a ticket for an artist_concert
-- (fallback: admin `concerts`), enforces capacity, distributes revenue.
CREATE PROCEDURE purchase_concert_ticket_from_wallet(
  IN  p_user_id    CHAR(36),
  IN  p_concert_id CHAR(36),
  OUT p_success    BOOLEAN,
  OUT p_code       VARCHAR(40),
  OUT p_entity_id  CHAR(36),
  OUT p_extra      VARCHAR(80)
)
proc: BEGIN
  DECLARE v_price DECIMAL(18,2); DECLARE v_artist CHAR(36);
  DECLARE v_max INT; DECLARE v_sold INT; DECLARE v_found INT DEFAULT 0;
  DECLARE v_existing CHAR(36); DECLARE v_ticket CHAR(36); DECLARE v_code VARCHAR(80); DECLARE v_dist CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_entity_id = NULL; SET p_extra = NULL;

  START TRANSACTION;
  SELECT ticket_price, artist_id, max_tickets, COALESCE(tickets_sold, 0), 1
    INTO v_price, v_artist, v_max, v_sold, v_found
    FROM artist_concerts WHERE id = p_concert_id;

  IF v_found = 0 THEN
    SELECT ticket_price, NULL, max_tickets,
           COALESCE((SELECT COUNT(*) FROM concert_tickets WHERE concert_id = p_concert_id), 0), 1
      INTO v_price, v_artist, v_max, v_sold, v_found
      FROM concerts WHERE id = p_concert_id;
  END IF;
  IF v_found = 0 THEN SET p_code = 'concert_not_found'; ROLLBACK; LEAVE proc; END IF;

  IF v_max IS NOT NULL AND v_sold >= v_max THEN SET p_code = 'sold_out'; ROLLBACK; LEAVE proc; END IF;

  SELECT id INTO v_existing FROM concert_tickets WHERE concert_id = p_concert_id AND user_id = p_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN SET p_code = 'already_purchased'; ROLLBACK; LEAVE proc; END IF;

  IF v_price > 0 THEN
    UPDATE user_wallets SET balance = balance - v_price, updated_at = UTC_TIMESTAMP()
      WHERE user_id = p_user_id AND balance >= v_price;
    IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;
  END IF;

  SET v_ticket = UUID();
  SET v_code = CONCAT('TICKET-', UNIX_TIMESTAMP(), '-', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 8));
  INSERT INTO concert_tickets (id, concert_id, user_id, price_paid, ticket_code, purchased_at)
    VALUES (v_ticket, p_concert_id, p_user_id, COALESCE(v_price, 0), v_code, UTC_TIMESTAMP());
  UPDATE artist_concerts SET tickets_sold = COALESCE(tickets_sold, 0) + 1 WHERE id = p_concert_id;

  IF v_price > 0 AND v_artist IS NOT NULL THEN
    CALL distribute_event_revenue('concert_ticket', p_concert_id, p_user_id, v_price,
      v_artist, NULL, NULL, NULL, JSON_OBJECT('ticket_id', v_ticket), v_dist);
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok'; SET p_entity_id = v_ticket; SET p_extra = v_code;
END;
-- @sep
DROP PROCEDURE IF EXISTS purchase_replay_access_from_wallet;
-- @sep
-- purchase_replay_access_from_wallet — unlocks a replay, distributes revenue.
CREATE PROCEDURE purchase_replay_access_from_wallet(
  IN  p_user_id   CHAR(36),
  IN  p_replay_id CHAR(36),
  OUT p_success   BOOLEAN,
  OUT p_code      VARCHAR(40),
  OUT p_entity_id CHAR(36)
)
proc: BEGIN
  DECLARE v_price DECIMAL(18,2); DECLARE v_artist CHAR(36);
  DECLARE v_duel CHAR(36); DECLARE v_concert CHAR(36); DECLARE v_a2 CHAR(36); DECLARE v_mgr CHAR(36);
  DECLARE v_source VARCHAR(40); DECLARE v_existing CHAR(36); DECLARE v_access CHAR(36); DECLARE v_dist CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_success = FALSE; SET p_code = 'error'; SET p_entity_id = NULL;

  START TRANSACTION;
  SELECT replay_price, artist_id, duel_id, concert_id INTO v_price, v_artist, v_duel, v_concert
    FROM replay_videos WHERE id = p_replay_id;
  IF v_price IS NULL AND v_artist IS NULL AND v_duel IS NULL AND v_concert IS NULL THEN
    SET p_code = 'replay_not_found'; ROLLBACK; LEAVE proc;
  END IF;

  SELECT id INTO v_existing FROM replay_access WHERE replay_id = p_replay_id AND user_id = p_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN SET p_code = 'already_purchased'; ROLLBACK; LEAVE proc; END IF;

  IF v_price > 0 THEN
    UPDATE user_wallets SET balance = balance - v_price, updated_at = UTC_TIMESTAMP()
      WHERE user_id = p_user_id AND balance >= v_price;
    IF ROW_COUNT() = 0 THEN SET p_code = 'insufficient_balance'; ROLLBACK; LEAVE proc; END IF;
  END IF;

  SET v_access = UUID();
  INSERT INTO replay_access (id, replay_id, user_id, unlocked_at)
    VALUES (v_access, p_replay_id, p_user_id, UTC_TIMESTAMP());

  IF v_price > 0 THEN
    IF v_duel IS NOT NULL THEN
      SELECT artist1_id, artist2_id, manager_id INTO v_artist, v_a2, v_mgr FROM duels WHERE id = v_duel;
      SET v_source = 'duel_replay';
    ELSE
      SET v_source = 'concert_replay';
    END IF;
    CALL distribute_event_revenue(v_source, p_replay_id, p_user_id, v_price,
      v_artist, v_a2, v_mgr, NULL, JSON_OBJECT('access_id', v_access), v_dist);
  END IF;

  COMMIT;
  SET p_success = TRUE; SET p_code = 'ok'; SET p_entity_id = v_access;
END;
