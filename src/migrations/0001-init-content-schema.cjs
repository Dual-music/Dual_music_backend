/* eslint-disable */
'use strict';

/**
 * Init migration — creates every content table (81 tables) parsed from the
 * frontend Supabase schema, then adds indexes and high-confidence foreign keys.
 *
 * NOTE: the auth `users` table (and refresh_tokens/otp_codes/oauth_accounts) is
 * created by migration 0000-init-auth so that user-referencing FKs resolve.
 * Reversible: `down` drops all tables with FK checks disabled.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('account_reports', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        details: { type: Sequelize.TEXT, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        reported_user_id: { type: Sequelize.UUID, allowNull: false },
        reporter_id: { type: Sequelize.UUID, allowNull: false },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('account_warnings', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_automatic: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        issued_by: { type: Sequelize.UUID, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
        warning_message: { type: Sequelize.TEXT, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('admin_logs', {
        action_type: { type: Sequelize.STRING, allowNull: false },
        admin_id: { type: Sequelize.UUID, allowNull: true },
        admin_name: { type: Sequelize.STRING, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        details: { type: Sequelize.JSON, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        target_id: { type: Sequelize.UUID, allowNull: true },
        target_name: { type: Sequelize.STRING, allowNull: true },
        target_type: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('artist_concerts', {
        allows_dedications: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        allows_sponsor_ads: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        approval_status: { type: Sequelize.STRING, allowNull: false },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        approved_by: { type: Sequelize.UUID, allowNull: true },
        artist_id: { type: Sequelize.UUID, allowNull: false },
        cover_image_url: { type: Sequelize.STRING(2048), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        description: { type: Sequelize.TEXT, allowNull: true },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_replay_available: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        max_tickets: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        recording_url: { type: Sequelize.STRING(2048), allowNull: true },
        rejection_reason: { type: Sequelize.TEXT, allowNull: true },
        revenue: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        scheduled_date: { type: Sequelize.DATE, allowNull: false },
        started_at: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'upcoming' },
        stream_url: { type: Sequelize.STRING(2048), allowNull: true },
        ticket_price: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        tickets_sold: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        title: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('artist_followers', {
        artist_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        follower_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('artist_lives', {
        artist_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_replay_available: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        recording_url: { type: Sequelize.STRING(2048), allowNull: true },
        room_id: { type: Sequelize.STRING, allowNull: true },
        started_at: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'live' },
        stream_url: { type: Sequelize.STRING(2048), allowNull: true },
        title: { type: Sequelize.STRING, allowNull: true },
        viewer_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('artist_profiles', {
        available_balance: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        avatar_url: { type: Sequelize.STRING(2048), allowNull: true },
        bio: { type: Sequelize.TEXT, allowNull: true },
        cover_image_url: { type: Sequelize.STRING(2048), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_public: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        social_links: { type: Sequelize.JSON, allowNull: true },
        stage_name: { type: Sequelize.STRING, allowNull: true },
        total_earnings: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('artist_requests', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        description: { type: Sequelize.TEXT, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        justification_document_url: { type: Sequelize.STRING(2048), allowNull: true },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        social_links: { type: Sequelize.JSON, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('blogs', {
        author_id: { type: Sequelize.UUID, allowNull: false },
        author_name: { type: Sequelize.STRING, allowNull: false },
        category: { type: Sequelize.STRING, allowNull: false, defaultValue: 'news' },
        content: { type: Sequelize.TEXT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        excerpt: { type: Sequelize.TEXT, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        image_url: { type: Sequelize.STRING(2048), allowNull: true },
        published: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        title: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        views_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('cinetpay_alerts', {
        acknowledged_at: { type: Sequelize.DATE, allowNull: true },
        acknowledged_by: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        event: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        payload: { type: Sequelize.JSON, allowNull: false },
        severity: { type: Sequelize.STRING, allowNull: false },
        transaction_id: { type: Sequelize.STRING, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('cinetpay_countries', {
        country_code: { type: Sequelize.STRING, primaryKey: true, allowNull: false },
        country_name: { type: Sequelize.STRING, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        currency: { type: Sequelize.STRING, allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        operators: { type: Sequelize.JSON, allowNull: false },
        phone_prefix: { type: Sequelize.STRING, allowNull: false },
        secret_key_name: { type: Sequelize.STRING, allowNull: false },
        secret_password_name: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('cinetpay_transactions', {
        amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        cinetpay_transaction_id: { type: Sequelize.STRING, allowNull: true },
        country_code: { type: Sequelize.STRING, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        credits_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        currency: { type: Sequelize.STRING, allowNull: false },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        kind: { type: Sequelize.STRING, allowNull: false },
        merchant_transaction_id: { type: Sequelize.STRING, allowNull: false },
        notify_token: { type: Sequelize.STRING, allowNull: false },
        payment_method: { type: Sequelize.STRING, allowNull: false },
        phone_number: { type: Sequelize.STRING, allowNull: false },
        processed_at: { type: Sequelize.DATE, allowNull: true },
        raw_init_response: { type: Sequelize.JSON, allowNull: true },
        raw_verify_response: { type: Sequelize.JSON, allowNull: true },
        raw_webhook_payload: { type: Sequelize.JSON, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, allowNull: false },
        withdrawal_request_id: { type: Sequelize.UUID, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('comment_likes', {
        comment_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('comments', {
        content: { type: Sequelize.TEXT, allowNull: false },
        content_id: { type: Sequelize.UUID, allowNull: false },
        content_type: { type: Sequelize.TEXT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        likes_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        parent_id: { type: Sequelize.UUID, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_ads', {
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        played: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        scheduled_at: { type: Sequelize.DATE, allowNull: true },
        sponsor_video_id: { type: Sequelize.UUID, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_bans', {
        banned_by: { type: Sequelize.UUID, allowNull: false },
        banned_user_id: { type: Sequelize.UUID, allowNull: false },
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_candidates', {
        artist_id: { type: Sequelize.UUID, allowNull: false },
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        entry_fee_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        entry_fee_paid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        final_rank: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        pitch: { type: Sequelize.STRING, allowNull: true },
        rejection_reason: { type: Sequelize.TEXT, allowNull: true },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        total_gifts_credits: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        total_votes: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        video_demo_url: { type: Sequelize.STRING(2048), allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_chat_messages', {
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_moderated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        parent_id: { type: Sequelize.UUID, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_gifts', {
        candidate_id: { type: Sequelize.UUID, allowNull: false },
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        credits: { type: Sequelize.INTEGER, allowNull: false },
        gift_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        sender_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_reports', {
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        details: { type: Sequelize.TEXT, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        reporter_id: { type: Sequelize.UUID, allowNull: false },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_tickets', {
        amount_paid: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        competition_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        paid_at: { type: Sequelize.DATE, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competition_votes', {
        candidate_id: { type: Sequelize.UUID, allowNull: false },
        competition_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        credits_spent: { type: Sequelize.INTEGER, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        voter_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('competitions', {
        application_deadline: { type: Sequelize.DATE, allowNull: false },
        application_opens_at: { type: Sequelize.DATE, allowNull: true },
        city: { type: Sequelize.STRING, allowNull: true },
        commune: { type: Sequelize.STRING, allowNull: true },
        country: { type: Sequelize.STRING, allowNull: true },
        cover_url: { type: Sequelize.STRING(2048), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        current_performer_duration_sec: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        current_performer_id: { type: Sequelize.UUID, allowNull: true },
        current_performer_started_at: { type: Sequelize.DATE, allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        district: { type: Sequelize.STRING, allowNull: true },
        eligibility_scope: { type: Sequelize.STRING, allowNull: false },
        eligible_countries: { type: Sequelize.STRING, allowNull: false },
        end_at: { type: Sequelize.DATE, allowNull: false },
        entry_fee_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        entry_fee_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        forced_focus_participant_id: { type: Sequelize.UUID, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_public_paid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        livekit_room: { type: Sequelize.STRING, allowNull: true },
        manager_id: { type: Sequelize.UUID, allowNull: true },
        max_candidates: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        mode: { type: Sequelize.STRING, allowNull: false },
        reward_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        reward_description: { type: Sequelize.TEXT, allowNull: true },
        sponsor_submission_deadline: { type: Sequelize.DATE, allowNull: true },
        start_at: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.STRING, allowNull: false },
        title: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        venue_address: { type: Sequelize.TEXT, allowNull: true },
        venue_contact: { type: Sequelize.STRING, allowNull: true },
        venue_name: { type: Sequelize.STRING, allowNull: true },
        viewer_ticket_price: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        winner_announced_at: { type: Sequelize.DATE, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('concert_chat_messages', {
        concert_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_moderated: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        parent_id: { type: Sequelize.UUID, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('concert_dedications', {
        artist_id: { type: Sequelize.UUID, allowNull: false },
        concert_id: { type: Sequelize.UUID, allowNull: false },
        concert_type: { type: Sequelize.STRING, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        delivered_at: { type: Sequelize.DATE, allowNull: true },
        fan_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        paid_at: { type: Sequelize.DATE, allowNull: false },
        price_credits: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        rejected_at: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('concert_reminders', {
        concert_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reminder_type: { type: Sequelize.STRING, allowNull: false },
        sent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('concert_tickets', {
        concert_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        price_paid: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        purchased_at: { type: Sequelize.DATE, allowNull: false },
        qr_code_url: { type: Sequelize.STRING(2048), allowNull: true },
        ticket_code: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
        validated_at: { type: Sequelize.DATE, allowNull: true },
        validated_by: { type: Sequelize.UUID, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('concerts', {
        artist_name: { type: Sequelize.STRING, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        description: { type: Sequelize.TEXT, allowNull: true },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        image_url: { type: Sequelize.STRING(2048), allowNull: true },
        is_replay_available: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        location: { type: Sequelize.STRING, allowNull: false },
        max_tickets: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        recording_url: { type: Sequelize.STRING(2048), allowNull: true },
        scheduled_date: { type: Sequelize.DATE, allowNull: false },
        scheduled_time: { type: Sequelize.STRING, allowNull: false },
        sponsor_submission_deadline: { type: Sequelize.DATE, allowNull: true },
        started_at: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'upcoming' },
        stream_url: { type: Sequelize.STRING(2048), allowNull: true },
        ticket_price: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        title: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('content_shares', {
        content_id: { type: Sequelize.UUID, allowNull: false },
        content_type: { type: Sequelize.TEXT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        platform: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('credit_purchases', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        credits_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        currency: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        paid_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        payment_method: { type: Sequelize.STRING, allowNull: false },
        payment_reference: { type: Sequelize.STRING, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duel_ads', {
        content_url: { type: Sequelize.STRING(2048), allowNull: false },
        created_by: { type: Sequelize.UUID, allowNull: true },
        duel_id: { type: Sequelize.UUID, allowNull: true },
        duration_seconds: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        played_at: { type: Sequelize.DATE, allowNull: true },
        scheduled_time: { type: Sequelize.STRING, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duel_chat_messages', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        duel_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_moderated: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        parent_id: { type: Sequelize.UUID, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duel_reminders', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        duel_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reminder_type: { type: Sequelize.STRING, allowNull: false },
        sent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duel_requests', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        manager_id: { type: Sequelize.UUID, allowNull: true },
        message: { type: Sequelize.TEXT, allowNull: true },
        opponent_id: { type: Sequelize.UUID, allowNull: false },
        proposed_date: { type: Sequelize.DATE, allowNull: true },
        requester_id: { type: Sequelize.UUID, allowNull: false },
        status: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duel_tickets', {
        duel_id: { type: Sequelize.UUID, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        price_paid: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        purchased_at: { type: Sequelize.DATE, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duel_votes', {
        amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        artist_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        duel_id: { type: Sequelize.UUID, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('duels', {
        allows_sponsor_ads: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        artist1_id: { type: Sequelize.UUID, allowNull: false },
        artist2_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        current_timer_ends_at: { type: Sequelize.DATE, allowNull: true },
        current_timer_target_id: { type: Sequelize.UUID, allowNull: true },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        manager_id: { type: Sequelize.UUID, allowNull: true },
        room_id: { type: Sequelize.STRING, allowNull: true },
        scheduled_time: { type: Sequelize.STRING, allowNull: true },
        sponsor_submission_deadline: { type: Sequelize.DATE, allowNull: true },
        started_at: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: true, defaultValue: 'upcoming' },
        ticket_price: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        winner_id: { type: Sequelize.UUID, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('email_notification_preferences', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        email_assignments: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_concerts: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_duels: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_gifts: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_lives: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_requests: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        email_votes: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('exchange_rates', {
        currency_code: { type: Sequelize.STRING, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING, allowNull: true },
        rate_per_usd: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        symbol: { type: Sequelize.STRING, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('fan_subscriptions', {
        expires_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        price_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        started_at: { type: Sequelize.DATE, allowNull: false },
        stripe_customer_id: { type: Sequelize.STRING, allowNull: true },
        stripe_subscription_id: { type: Sequelize.STRING, allowNull: true },
        subscription_type: { type: Sequelize.STRING, allowNull: false, defaultValue: 'free' },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('gift_conversions', {
        cash_value: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        gift_value: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('gift_transactions', {
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        duel_id: { type: Sequelize.UUID, allowNull: true },
        from_user_id: { type: Sequelize.UUID, allowNull: false },
        gift_id: { type: Sequelize.UUID, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        live_id: { type: Sequelize.UUID, allowNull: true },
        to_user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('leaderboard_rewards', {
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        credits_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        physical_description: { type: Sequelize.TEXT, allowNull: true },
        rank_position: { type: Sequelize.INTEGER, allowNull: false },
        reward_type: { type: Sequelize.STRING, allowNull: false },
        season_id: { type: Sequelize.UUID, allowNull: false },
        virtual_gift_id: { type: Sequelize.UUID, allowNull: true },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('leaderboard_seasons', {
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        end_date: { type: Sequelize.DATE, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        is_mystery_reward: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        name: { type: Sequelize.STRING, allowNull: false },
        start_date: { type: Sequelize.DATE, allowNull: false },
        type: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('lifestyle_videos', {
        artist_id: { type: Sequelize.UUID, allowNull: false },
        artist_name: { type: Sequelize.STRING, allowNull: false },
        comments_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        description: { type: Sequelize.TEXT, allowNull: true },
        duration: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        likes_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        thumbnail_url: { type: Sequelize.STRING(2048), allowNull: true },
        title: { type: Sequelize.STRING, allowNull: false },
        video_url: { type: Sequelize.STRING(2048), allowNull: false },
        views_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('live_chat_messages', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_moderated: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        live_id: { type: Sequelize.UUID, allowNull: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('live_join_requests', {
        accepted_at: { type: Sequelize.DATE, allowNull: true },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        live_id: { type: Sequelize.UUID, allowNull: false },
        requested_at: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('live_likes', {
        likes_count: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
        live_id: { type: Sequelize.UUID, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('live_reports', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        details: { type: Sequelize.TEXT, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        live_id: { type: Sequelize.UUID, allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: false },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('manager_profiles', {
        avatar_url: { type: Sequelize.STRING(2048), allowNull: true },
        bio: { type: Sequelize.TEXT, allowNull: true },
        commission_rate: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 10 },
        cover_image_url: { type: Sequelize.STRING(2048), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        display_name: { type: Sequelize.STRING, allowNull: true },
        experience: { type: Sequelize.TEXT, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_public: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        social_links: { type: Sequelize.JSON, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('manager_requests', {
        bio: { type: Sequelize.TEXT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        experience: { type: Sequelize.TEXT, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('moneroo_transactions', {
        amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        credits_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        currency: { type: Sequelize.STRING, allowNull: false },
        debug_logs: { type: Sequelize.JSON, allowNull: false },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        http_status: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        http_status_text: { type: Sequelize.STRING, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        kind: { type: Sequelize.STRING, allowNull: false },
        merchant_transaction_id: { type: Sequelize.STRING, allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        moneroo_transaction_id: { type: Sequelize.STRING, allowNull: true },
        payment_method: { type: Sequelize.STRING, allowNull: true },
        phone_number: { type: Sequelize.STRING, allowNull: true },
        processed_at: { type: Sequelize.DATE, allowNull: true },
        raw_init_response: { type: Sequelize.JSON, allowNull: true },
        raw_verify_response: { type: Sequelize.JSON, allowNull: true },
        raw_webhook_payload: { type: Sequelize.JSON, allowNull: true },
        request_headers: { type: Sequelize.JSON, allowNull: true },
        request_payload: { type: Sequelize.JSON, allowNull: true },
        request_sent_at: { type: Sequelize.DATE, allowNull: true },
        request_url: { type: Sequelize.STRING(2048), allowNull: true },
        response_received_at: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('notifications', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        data: { type: Sequelize.JSON, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        message: { type: Sequelize.TEXT, allowNull: false },
        read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        title: { type: Sequelize.STRING, allowNull: false },
        type: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('platform_settings', {
        key: { type: Sequelize.STRING, primaryKey: true, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_by: { type: Sequelize.UUID, allowNull: true },
        value: { type: Sequelize.JSON, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('profiles', {
        avatar_url: { type: Sequelize.STRING(2048), allowNull: true },
        banned_at: { type: Sequelize.DATE, allowNull: true },
        banned_is_permanent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        banned_reason: { type: Sequelize.TEXT, allowNull: true },
        banned_until: { type: Sequelize.DATE, allowNull: true },
        bio: { type: Sequelize.TEXT, allowNull: true },
        country_code: { type: Sequelize.STRING, allowNull: true, defaultValue: 'FR' },
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        email: { type: Sequelize.STRING, allowNull: false },
        full_name: { type: Sequelize.STRING, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_banned: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        is_public: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        phone: { type: Sequelize.STRING, allowNull: true },
        phone_country_code: { type: Sequelize.STRING, allowNull: true, defaultValue: '+33' },
        referral_code: { type: Sequelize.STRING, allowNull: true },
        referred_by: { type: Sequelize.UUID, allowNull: true },
        social_links: { type: Sequelize.JSON, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('push_subscriptions', {
        auth: { type: Sequelize.STRING, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        endpoint: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        p256dh: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('referrals', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        referral_code: { type: Sequelize.STRING, allowNull: false },
        referred_id: { type: Sequelize.UUID, allowNull: false },
        referrer_id: { type: Sequelize.UUID, allowNull: false },
        reward_claimed: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
        status: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('replay_access', {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        replay_id: { type: Sequelize.UUID, allowNull: false },
        unlocked_at: { type: Sequelize.DATE, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('replay_likes', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        replay_id: { type: Sequelize.UUID, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('replay_videos', {
        artist_id: { type: Sequelize.UUID, allowNull: true },
        competition_id: { type: Sequelize.UUID, allowNull: true },
        concert_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        created_by: { type: Sequelize.UUID, allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        duel_id: { type: Sequelize.UUID, allowNull: true },
        duration: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_premium: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        is_public: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        recorded_date: { type: Sequelize.DATE, allowNull: false },
        replay_price: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        source_type: { type: Sequelize.STRING, allowNull: false },
        thumbnail_url: { type: Sequelize.STRING(2048), allowNull: true },
        title: { type: Sequelize.STRING, allowNull: false },
        video_url: { type: Sequelize.STRING(2048), allowNull: false },
        views_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('revenue_distributions', {
        artist1_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        artist1_id: { type: Sequelize.UUID, allowNull: true },
        artist2_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        artist2_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        manager_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        manager_id: { type: Sequelize.UUID, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        payer_id: { type: Sequelize.UUID, allowNull: false },
        platform_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        source_id: { type: Sequelize.UUID, allowNull: true },
        source_type: { type: Sequelize.STRING, allowNull: false },
        total_credits: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('season_winners', {
        counter_location: { type: Sequelize.STRING, allowNull: true },
        counter_notes: { type: Sequelize.TEXT, allowNull: true },
        counter_proposed_at: { type: Sequelize.DATE, allowNull: true },
        counter_when: { type: Sequelize.STRING, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        distributed_at: { type: Sequelize.DATE, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        meeting_location: { type: Sequelize.STRING, allowNull: true },
        meeting_notes: { type: Sequelize.TEXT, allowNull: true },
        meeting_proposed_at: { type: Sequelize.DATE, allowNull: true },
        meeting_proposed_by: { type: Sequelize.UUID, allowNull: true },
        meeting_status: { type: Sequelize.STRING, allowNull: false },
        meeting_when: { type: Sequelize.STRING, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        notified_winner_at: { type: Sequelize.DATE, allowNull: true },
        rank_position: { type: Sequelize.INTEGER, allowNull: false },
        received_at: { type: Sequelize.DATE, allowNull: true },
        reward_status: { type: Sequelize.STRING, allowNull: false },
        season_id: { type: Sequelize.UUID, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('sponsor_ad_plays', {
        ad_video_id: { type: Sequelize.UUID, allowNull: false },
        duration_seconds: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        event_id: { type: Sequelize.UUID, allowNull: false },
        event_type: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        played_at: { type: Sequelize.DATE, allowNull: false },
        request_id: { type: Sequelize.UUID, allowNull: true },
        sponsor_paid_credits: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        triggered_by: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('sponsor_ad_videos', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        duration_seconds: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        event_id: { type: Sequelize.UUID, allowNull: false },
        event_type: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        play_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        source_request_ids: { type: Sequelize.STRING, allowNull: true },
        title: { type: Sequelize.STRING, allowNull: false },
        uploaded_by: { type: Sequelize.UUID, allowNull: true },
        video_url: { type: Sequelize.STRING(2048), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('sponsor_price_tiers', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        label: { type: Sequelize.STRING, allowNull: false },
        max_seconds: { type: Sequelize.INTEGER, allowNull: false },
        min_seconds: { type: Sequelize.INTEGER, allowNull: false },
        price_credits: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('sponsor_requests', {
        approved_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        description: { type: Sequelize.TEXT, allowNull: false },
        event_id: { type: Sequelize.UUID, allowNull: false },
        event_type: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        media_duration_seconds: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        media_type: { type: Sequelize.STRING, allowNull: false },
        media_url: { type: Sequelize.STRING(2048), allowNull: false },
        paid_at: { type: Sequelize.DATE, allowNull: true },
        price_credits: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        rejected_reason: { type: Sequelize.TEXT, allowNull: true },
        requester_id: { type: Sequelize.UUID, allowNull: false },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('stream_bans', {
        banned_by: { type: Sequelize.UUID, allowNull: false },
        banned_user_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: true },
        stream_id: { type: Sequelize.UUID, allowNull: false },
        stream_type: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('subscription_plans', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        currency: { type: Sequelize.STRING, allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: false },
        features: { type: Sequelize.JSON, allowNull: false },
        gradient: { type: Sequelize.STRING, allowNull: false },
        icon: { type: Sequelize.STRING, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        name: { type: Sequelize.STRING, allowNull: false },
        price: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        rules: { type: Sequelize.JSON, allowNull: false },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_badges', {
        badge_icon: { type: Sequelize.STRING, allowNull: false },
        badge_name: { type: Sequelize.STRING, allowNull: false },
        badge_type: { type: Sequelize.STRING, allowNull: false },
        earned_at: { type: Sequelize.DATE, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        month_year: { type: Sequelize.STRING, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_currency_preferences', {
        currency_code: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_gifts', {
        gift_id: { type: Sequelize.UUID, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        purchased_at: { type: Sequelize.DATE, allowNull: false },
        quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_payout_methods', {
        account_holder: { type: Sequelize.STRING, allowNull: true },
        bank_name: { type: Sequelize.STRING, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        iban: { type: Sequelize.STRING, allowNull: true },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        label: { type: Sequelize.STRING, allowNull: true },
        method: { type: Sequelize.STRING, allowNull: false },
        mobile_operator: { type: Sequelize.STRING, allowNull: true },
        paypal_email: { type: Sequelize.STRING, allowNull: true },
        phone_number: { type: Sequelize.STRING, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_roles', {
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        role: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_ui_preferences', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        reduce_animations: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        timezone: { type: Sequelize.STRING, allowNull: false },
        top_donor_animation: { type: Sequelize.STRING, allowNull: false },
        top_donor_mode: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_wallets', {
        balance: { type: Sequelize.DECIMAL(18, 2), allowNull: true, defaultValue: 0 },
        updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('user_withdrawal_pins', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        failed_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        locked_until: { type: Sequelize.DATE, allowNull: true },
        pin_hash: { type: Sequelize.STRING, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        user_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('video_interactions', {
        comment_text: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        interaction_type: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
        video_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('virtual_gifts', {
        created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        image_url: { type: Sequelize.STRING(2048), allowNull: true },
        name: { type: Sequelize.STRING, allowNull: false },
        price: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('webrtc_signaling', {
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        payload: { type: Sequelize.JSON, allowNull: false },
        room_id: { type: Sequelize.STRING, allowNull: false },
        sender_id: { type: Sequelize.UUID, allowNull: false },
        target_id: { type: Sequelize.UUID, allowNull: true },
        type: { type: Sequelize.STRING, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('withdrawal_pin_reset_tokens', {
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        otp_hash: { type: Sequelize.STRING, allowNull: false },
        used_at: { type: Sequelize.DATE, allowNull: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });
      await queryInterface.createTable('withdrawal_requests', {
        amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        auto_processed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('(UUID())'), allowNull: false },
        payment_details: { type: Sequelize.JSON, allowNull: true },
        payment_method: { type: Sequelize.STRING, allowNull: true },
        processed_at: { type: Sequelize.DATE, allowNull: true },
        processed_by: { type: Sequelize.UUID, allowNull: true },
        provider: { type: Sequelize.STRING, allowNull: true },
        provider_tx_id: { type: Sequelize.STRING, allowNull: true },
        status: { type: Sequelize.STRING, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false },
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });

      // --- Indexes ---
      await queryInterface.addIndex('account_reports', ['created_at'], { transaction });
      await queryInterface.addIndex('account_reports', ['reported_user_id'], { transaction });
      await queryInterface.addIndex('account_reports', ['reporter_id'], { transaction });
      await queryInterface.addIndex('account_reports', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('account_warnings', ['created_at'], { transaction });
      await queryInterface.addIndex('account_warnings', ['issued_by'], { transaction });
      await queryInterface.addIndex('account_warnings', ['user_id'], { transaction });
      await queryInterface.addIndex('admin_logs', ['admin_id'], { transaction });
      await queryInterface.addIndex('admin_logs', ['created_at'], { transaction });
      await queryInterface.addIndex('admin_logs', ['target_id'], { transaction });
      await queryInterface.addIndex('artist_concerts', ['approved_by'], { transaction });
      await queryInterface.addIndex('artist_concerts', ['artist_id'], { transaction });
      await queryInterface.addIndex('artist_concerts', ['created_at'], { transaction });
      await queryInterface.addIndex('artist_followers', ['artist_id'], { transaction });
      await queryInterface.addIndex('artist_followers', ['created_at'], { transaction });
      await queryInterface.addIndex('artist_followers', ['follower_id'], { transaction });
      await queryInterface.addIndex('artist_followers', ['artist_id', 'follower_id'], { unique: true, transaction });
      await queryInterface.addIndex('artist_lives', ['artist_id'], { transaction });
      await queryInterface.addIndex('artist_lives', ['created_at'], { transaction });
      await queryInterface.addIndex('artist_profiles', ['created_at'], { transaction });
      await queryInterface.addIndex('artist_profiles', ['user_id'], { transaction });
      await queryInterface.addIndex('artist_requests', ['created_at'], { transaction });
      await queryInterface.addIndex('artist_requests', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('artist_requests', ['user_id'], { transaction });
      await queryInterface.addIndex('blogs', ['author_id'], { transaction });
      await queryInterface.addIndex('blogs', ['created_at'], { transaction });
      await queryInterface.addIndex('cinetpay_alerts', ['acknowledged_by'], { transaction });
      await queryInterface.addIndex('cinetpay_alerts', ['created_at'], { transaction });
      await queryInterface.addIndex('cinetpay_countries', ['created_at'], { transaction });
      await queryInterface.addIndex('cinetpay_transactions', ['created_at'], { transaction });
      await queryInterface.addIndex('cinetpay_transactions', ['user_id'], { transaction });
      await queryInterface.addIndex('cinetpay_transactions', ['withdrawal_request_id'], { transaction });
      await queryInterface.addIndex('comment_likes', ['comment_id'], { transaction });
      await queryInterface.addIndex('comment_likes', ['created_at'], { transaction });
      await queryInterface.addIndex('comment_likes', ['user_id'], { transaction });
      await queryInterface.addIndex('comment_likes', ['comment_id', 'user_id'], { unique: true, transaction });
      await queryInterface.addIndex('comments', ['content_id'], { transaction });
      await queryInterface.addIndex('comments', ['created_at'], { transaction });
      await queryInterface.addIndex('comments', ['parent_id'], { transaction });
      await queryInterface.addIndex('comments', ['user_id'], { transaction });
      await queryInterface.addIndex('competition_ads', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_ads', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_ads', ['sponsor_video_id'], { transaction });
      await queryInterface.addIndex('competition_bans', ['banned_by'], { transaction });
      await queryInterface.addIndex('competition_bans', ['banned_user_id'], { transaction });
      await queryInterface.addIndex('competition_bans', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_bans', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_candidates', ['artist_id'], { transaction });
      await queryInterface.addIndex('competition_candidates', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_candidates', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_candidates', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('competition_chat_messages', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_chat_messages', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_chat_messages', ['parent_id'], { transaction });
      await queryInterface.addIndex('competition_chat_messages', ['user_id'], { transaction });
      await queryInterface.addIndex('competition_gifts', ['candidate_id'], { transaction });
      await queryInterface.addIndex('competition_gifts', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_gifts', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_gifts', ['gift_id'], { transaction });
      await queryInterface.addIndex('competition_gifts', ['sender_id'], { transaction });
      await queryInterface.addIndex('competition_reports', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_reports', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_reports', ['reporter_id'], { transaction });
      await queryInterface.addIndex('competition_reports', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('competition_tickets', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_tickets', ['user_id'], { transaction });
      await queryInterface.addIndex('competition_votes', ['candidate_id'], { transaction });
      await queryInterface.addIndex('competition_votes', ['competition_id'], { transaction });
      await queryInterface.addIndex('competition_votes', ['created_at'], { transaction });
      await queryInterface.addIndex('competition_votes', ['voter_id'], { transaction });
      await queryInterface.addIndex('competition_votes', ['competition_id', 'voter_id', 'candidate_id'], { unique: true, transaction });
      await queryInterface.addIndex('competitions', ['created_at'], { transaction });
      await queryInterface.addIndex('competitions', ['current_performer_id'], { transaction });
      await queryInterface.addIndex('competitions', ['forced_focus_participant_id'], { transaction });
      await queryInterface.addIndex('competitions', ['manager_id'], { transaction });
      await queryInterface.addIndex('concert_chat_messages', ['concert_id'], { transaction });
      await queryInterface.addIndex('concert_chat_messages', ['created_at'], { transaction });
      await queryInterface.addIndex('concert_chat_messages', ['parent_id'], { transaction });
      await queryInterface.addIndex('concert_chat_messages', ['user_id'], { transaction });
      await queryInterface.addIndex('concert_dedications', ['artist_id'], { transaction });
      await queryInterface.addIndex('concert_dedications', ['concert_id'], { transaction });
      await queryInterface.addIndex('concert_dedications', ['created_at'], { transaction });
      await queryInterface.addIndex('concert_dedications', ['fan_id'], { transaction });
      await queryInterface.addIndex('concert_reminders', ['concert_id'], { transaction });
      await queryInterface.addIndex('concert_reminders', ['created_at'], { transaction });
      await queryInterface.addIndex('concert_reminders', ['user_id'], { transaction });
      await queryInterface.addIndex('concert_tickets', ['concert_id'], { transaction });
      await queryInterface.addIndex('concert_tickets', ['user_id'], { transaction });
      await queryInterface.addIndex('concert_tickets', ['validated_by'], { transaction });
      await queryInterface.addIndex('concerts', ['created_at'], { transaction });
      await queryInterface.addIndex('content_shares', ['content_id'], { transaction });
      await queryInterface.addIndex('content_shares', ['created_at'], { transaction });
      await queryInterface.addIndex('content_shares', ['user_id'], { transaction });
      await queryInterface.addIndex('credit_purchases', ['created_at'], { transaction });
      await queryInterface.addIndex('credit_purchases', ['user_id'], { transaction });
      await queryInterface.addIndex('duel_ads', ['created_by'], { transaction });
      await queryInterface.addIndex('duel_ads', ['duel_id'], { transaction });
      await queryInterface.addIndex('duel_chat_messages', ['created_at'], { transaction });
      await queryInterface.addIndex('duel_chat_messages', ['duel_id'], { transaction });
      await queryInterface.addIndex('duel_chat_messages', ['parent_id'], { transaction });
      await queryInterface.addIndex('duel_chat_messages', ['user_id'], { transaction });
      await queryInterface.addIndex('duel_reminders', ['created_at'], { transaction });
      await queryInterface.addIndex('duel_reminders', ['duel_id'], { transaction });
      await queryInterface.addIndex('duel_reminders', ['user_id'], { transaction });
      await queryInterface.addIndex('duel_requests', ['created_at'], { transaction });
      await queryInterface.addIndex('duel_requests', ['manager_id'], { transaction });
      await queryInterface.addIndex('duel_requests', ['opponent_id'], { transaction });
      await queryInterface.addIndex('duel_requests', ['requester_id'], { transaction });
      await queryInterface.addIndex('duel_tickets', ['duel_id'], { transaction });
      await queryInterface.addIndex('duel_tickets', ['user_id'], { transaction });
      await queryInterface.addIndex('duel_votes', ['artist_id'], { transaction });
      await queryInterface.addIndex('duel_votes', ['created_at'], { transaction });
      await queryInterface.addIndex('duel_votes', ['duel_id'], { transaction });
      await queryInterface.addIndex('duel_votes', ['user_id'], { transaction });
      await queryInterface.addIndex('duels', ['artist1_id'], { transaction });
      await queryInterface.addIndex('duels', ['artist2_id'], { transaction });
      await queryInterface.addIndex('duels', ['created_at'], { transaction });
      await queryInterface.addIndex('duels', ['current_timer_target_id'], { transaction });
      await queryInterface.addIndex('duels', ['manager_id'], { transaction });
      await queryInterface.addIndex('duels', ['winner_id'], { transaction });
      await queryInterface.addIndex('email_notification_preferences', ['created_at'], { transaction });
      await queryInterface.addIndex('email_notification_preferences', ['user_id'], { transaction });
      await queryInterface.addIndex('fan_subscriptions', ['user_id'], { transaction });
      await queryInterface.addIndex('gift_conversions', ['created_at'], { transaction });
      await queryInterface.addIndex('gift_conversions', ['user_id'], { transaction });
      await queryInterface.addIndex('gift_transactions', ['created_at'], { transaction });
      await queryInterface.addIndex('gift_transactions', ['duel_id'], { transaction });
      await queryInterface.addIndex('gift_transactions', ['from_user_id'], { transaction });
      await queryInterface.addIndex('gift_transactions', ['gift_id'], { transaction });
      await queryInterface.addIndex('gift_transactions', ['live_id'], { transaction });
      await queryInterface.addIndex('gift_transactions', ['to_user_id'], { transaction });
      await queryInterface.addIndex('leaderboard_rewards', ['created_at'], { transaction });
      await queryInterface.addIndex('leaderboard_rewards', ['season_id'], { transaction });
      await queryInterface.addIndex('leaderboard_rewards', ['virtual_gift_id'], { transaction });
      await queryInterface.addIndex('leaderboard_seasons', ['created_at'], { transaction });
      await queryInterface.addIndex('lifestyle_videos', ['artist_id'], { transaction });
      await queryInterface.addIndex('lifestyle_videos', ['created_at'], { transaction });
      await queryInterface.addIndex('live_chat_messages', ['created_at'], { transaction });
      await queryInterface.addIndex('live_chat_messages', ['live_id'], { transaction });
      await queryInterface.addIndex('live_chat_messages', ['user_id'], { transaction });
      await queryInterface.addIndex('live_join_requests', ['live_id'], { transaction });
      await queryInterface.addIndex('live_join_requests', ['user_id'], { transaction });
      await queryInterface.addIndex('live_likes', ['live_id'], { transaction });
      await queryInterface.addIndex('live_reports', ['created_at'], { transaction });
      await queryInterface.addIndex('live_reports', ['live_id'], { transaction });
      await queryInterface.addIndex('live_reports', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('live_reports', ['user_id'], { transaction });
      await queryInterface.addIndex('manager_profiles', ['created_at'], { transaction });
      await queryInterface.addIndex('manager_profiles', ['user_id'], { transaction });
      await queryInterface.addIndex('manager_requests', ['created_at'], { transaction });
      await queryInterface.addIndex('manager_requests', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('manager_requests', ['user_id'], { transaction });
      await queryInterface.addIndex('moneroo_transactions', ['created_at'], { transaction });
      await queryInterface.addIndex('moneroo_transactions', ['user_id'], { transaction });
      await queryInterface.addIndex('notifications', ['created_at'], { transaction });
      await queryInterface.addIndex('notifications', ['user_id'], { transaction });
      await queryInterface.addIndex('platform_settings', ['updated_by'], { transaction });
      await queryInterface.addIndex('profiles', ['created_at'], { transaction });
      await queryInterface.addIndex('profiles', ['referred_by'], { transaction });
      await queryInterface.addIndex('profiles', ['referral_code'], { unique: true, transaction });
      await queryInterface.addIndex('push_subscriptions', ['created_at'], { transaction });
      await queryInterface.addIndex('push_subscriptions', ['user_id'], { transaction });
      await queryInterface.addIndex('referrals', ['created_at'], { transaction });
      await queryInterface.addIndex('referrals', ['referred_id'], { transaction });
      await queryInterface.addIndex('referrals', ['referrer_id'], { transaction });
      await queryInterface.addIndex('referrals', ['referrer_id', 'referred_id'], { unique: true, transaction });
      await queryInterface.addIndex('replay_access', ['replay_id'], { transaction });
      await queryInterface.addIndex('replay_access', ['user_id'], { transaction });
      await queryInterface.addIndex('replay_likes', ['created_at'], { transaction });
      await queryInterface.addIndex('replay_likes', ['replay_id'], { transaction });
      await queryInterface.addIndex('replay_likes', ['user_id'], { transaction });
      await queryInterface.addIndex('replay_likes', ['replay_id', 'user_id'], { unique: true, transaction });
      await queryInterface.addIndex('replay_videos', ['artist_id'], { transaction });
      await queryInterface.addIndex('replay_videos', ['competition_id'], { transaction });
      await queryInterface.addIndex('replay_videos', ['concert_id'], { transaction });
      await queryInterface.addIndex('replay_videos', ['created_at'], { transaction });
      await queryInterface.addIndex('replay_videos', ['created_by'], { transaction });
      await queryInterface.addIndex('replay_videos', ['duel_id'], { transaction });
      await queryInterface.addIndex('revenue_distributions', ['artist1_id'], { transaction });
      await queryInterface.addIndex('revenue_distributions', ['artist2_id'], { transaction });
      await queryInterface.addIndex('revenue_distributions', ['created_at'], { transaction });
      await queryInterface.addIndex('revenue_distributions', ['manager_id'], { transaction });
      await queryInterface.addIndex('revenue_distributions', ['payer_id'], { transaction });
      await queryInterface.addIndex('revenue_distributions', ['source_id'], { transaction });
      await queryInterface.addIndex('season_winners', ['created_at'], { transaction });
      await queryInterface.addIndex('season_winners', ['meeting_proposed_by'], { transaction });
      await queryInterface.addIndex('season_winners', ['season_id'], { transaction });
      await queryInterface.addIndex('season_winners', ['user_id'], { transaction });
      await queryInterface.addIndex('sponsor_ad_plays', ['ad_video_id'], { transaction });
      await queryInterface.addIndex('sponsor_ad_plays', ['event_id'], { transaction });
      await queryInterface.addIndex('sponsor_ad_plays', ['request_id'], { transaction });
      await queryInterface.addIndex('sponsor_ad_plays', ['triggered_by'], { transaction });
      await queryInterface.addIndex('sponsor_ad_videos', ['created_at'], { transaction });
      await queryInterface.addIndex('sponsor_ad_videos', ['event_id'], { transaction });
      await queryInterface.addIndex('sponsor_ad_videos', ['uploaded_by'], { transaction });
      await queryInterface.addIndex('sponsor_price_tiers', ['created_at'], { transaction });
      await queryInterface.addIndex('sponsor_requests', ['created_at'], { transaction });
      await queryInterface.addIndex('sponsor_requests', ['event_id'], { transaction });
      await queryInterface.addIndex('sponsor_requests', ['requester_id'], { transaction });
      await queryInterface.addIndex('sponsor_requests', ['reviewed_by'], { transaction });
      await queryInterface.addIndex('stream_bans', ['banned_by'], { transaction });
      await queryInterface.addIndex('stream_bans', ['banned_user_id'], { transaction });
      await queryInterface.addIndex('stream_bans', ['created_at'], { transaction });
      await queryInterface.addIndex('stream_bans', ['stream_id'], { transaction });
      await queryInterface.addIndex('subscription_plans', ['created_at'], { transaction });
      await queryInterface.addIndex('user_badges', ['user_id'], { transaction });
      await queryInterface.addIndex('user_currency_preferences', ['user_id'], { transaction });
      await queryInterface.addIndex('user_gifts', ['gift_id'], { transaction });
      await queryInterface.addIndex('user_gifts', ['user_id'], { transaction });
      await queryInterface.addIndex('user_payout_methods', ['created_at'], { transaction });
      await queryInterface.addIndex('user_payout_methods', ['user_id'], { transaction });
      await queryInterface.addIndex('user_roles', ['created_at'], { transaction });
      await queryInterface.addIndex('user_roles', ['user_id'], { transaction });
      await queryInterface.addIndex('user_roles', ['user_id', 'role'], { unique: true, transaction });
      await queryInterface.addIndex('user_ui_preferences', ['created_at'], { transaction });
      await queryInterface.addIndex('user_ui_preferences', ['user_id'], { transaction });
      await queryInterface.addIndex('user_wallets', ['user_id'], { transaction });
      await queryInterface.addIndex('user_withdrawal_pins', ['created_at'], { transaction });
      await queryInterface.addIndex('user_withdrawal_pins', ['user_id'], { transaction });
      await queryInterface.addIndex('video_interactions', ['created_at'], { transaction });
      await queryInterface.addIndex('video_interactions', ['user_id'], { transaction });
      await queryInterface.addIndex('video_interactions', ['video_id'], { transaction });
      await queryInterface.addIndex('virtual_gifts', ['created_at'], { transaction });
      await queryInterface.addIndex('webrtc_signaling', ['created_at'], { transaction });
      await queryInterface.addIndex('webrtc_signaling', ['sender_id'], { transaction });
      await queryInterface.addIndex('webrtc_signaling', ['target_id'], { transaction });
      await queryInterface.addIndex('withdrawal_pin_reset_tokens', ['created_at'], { transaction });
      await queryInterface.addIndex('withdrawal_pin_reset_tokens', ['user_id'], { transaction });
      await queryInterface.addIndex('withdrawal_requests', ['created_at'], { transaction });
      await queryInterface.addIndex('withdrawal_requests', ['processed_by'], { transaction });
      await queryInterface.addIndex('withdrawal_requests', ['user_id'], { transaction });

      // --- Foreign keys (high-confidence) ---
      await queryInterface.addConstraint('account_reports', {
        fields: ['reported_user_id'],
        type: 'foreign key',
        name: 'fk_account_reports_reported_user_id_0',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('account_reports', {
        fields: ['reporter_id'],
        type: 'foreign key',
        name: 'fk_account_reports_reporter_id_1',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('account_reports', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_account_reports_reviewed_by_2',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('account_warnings', {
        fields: ['issued_by'],
        type: 'foreign key',
        name: 'fk_account_warnings_issued_by_3',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('account_warnings', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_account_warnings_user_id_4',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('admin_logs', {
        fields: ['admin_id'],
        type: 'foreign key',
        name: 'fk_admin_logs_admin_id_5',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_concerts', {
        fields: ['approved_by'],
        type: 'foreign key',
        name: 'fk_artist_concerts_approved_by_6',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_concerts', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_artist_concerts_artist_id_7',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_followers', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_artist_followers_artist_id_8',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_followers', {
        fields: ['follower_id'],
        type: 'foreign key',
        name: 'fk_artist_followers_follower_id_9',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_lives', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_artist_lives_artist_id_10',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_profiles', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_artist_profiles_user_id_11',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_requests', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_artist_requests_reviewed_by_12',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('artist_requests', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_artist_requests_user_id_13',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('blogs', {
        fields: ['author_id'],
        type: 'foreign key',
        name: 'fk_blogs_author_id_14',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('cinetpay_alerts', {
        fields: ['acknowledged_by'],
        type: 'foreign key',
        name: 'fk_cinetpay_alerts_acknowledged_by_15',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('cinetpay_transactions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_cinetpay_transactions_user_id_16',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('cinetpay_transactions', {
        fields: ['withdrawal_request_id'],
        type: 'foreign key',
        name: 'fk_cinetpay_transactions_withdrawal_request_id_17',
        references: { table: 'withdrawal_requests', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('comment_likes', {
        fields: ['comment_id'],
        type: 'foreign key',
        name: 'fk_comment_likes_comment_id_18',
        references: { table: 'comments', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('comment_likes', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_comment_likes_user_id_19',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('comments', {
        fields: ['parent_id'],
        type: 'foreign key',
        name: 'fk_comments_parent_id_20',
        references: { table: 'comments', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('comments', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_comments_user_id_21',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_ads', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_ads_competition_id_22',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_bans', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_bans_competition_id_23',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_candidates', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_competition_candidates_artist_id_24',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_candidates', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_candidates_competition_id_25',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_candidates', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_competition_candidates_reviewed_by_26',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_chat_messages', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_chat_messages_competition_id_27',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_chat_messages', {
        fields: ['parent_id'],
        type: 'foreign key',
        name: 'fk_competition_chat_messages_parent_id_28',
        references: { table: 'competition_chat_messages', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_chat_messages', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_competition_chat_messages_user_id_29',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_gifts', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_gifts_competition_id_30',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_gifts', {
        fields: ['sender_id'],
        type: 'foreign key',
        name: 'fk_competition_gifts_sender_id_31',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_reports', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_reports_competition_id_32',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_reports', {
        fields: ['reporter_id'],
        type: 'foreign key',
        name: 'fk_competition_reports_reporter_id_33',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_reports', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_competition_reports_reviewed_by_34',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_tickets', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_tickets_competition_id_35',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_tickets', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_competition_tickets_user_id_36',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_votes', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_competition_votes_competition_id_37',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competition_votes', {
        fields: ['voter_id'],
        type: 'foreign key',
        name: 'fk_competition_votes_voter_id_38',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('competitions', {
        fields: ['manager_id'],
        type: 'foreign key',
        name: 'fk_competitions_manager_id_39',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_chat_messages', {
        fields: ['concert_id'],
        type: 'foreign key',
        name: 'fk_concert_chat_messages_concert_id_40',
        references: { table: 'concerts', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_chat_messages', {
        fields: ['parent_id'],
        type: 'foreign key',
        name: 'fk_concert_chat_messages_parent_id_41',
        references: { table: 'concert_chat_messages', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_chat_messages', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_concert_chat_messages_user_id_42',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_dedications', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_concert_dedications_artist_id_43',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_dedications', {
        fields: ['concert_id'],
        type: 'foreign key',
        name: 'fk_concert_dedications_concert_id_44',
        references: { table: 'concerts', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_reminders', {
        fields: ['concert_id'],
        type: 'foreign key',
        name: 'fk_concert_reminders_concert_id_45',
        references: { table: 'concerts', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_reminders', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_concert_reminders_user_id_46',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_tickets', {
        fields: ['concert_id'],
        type: 'foreign key',
        name: 'fk_concert_tickets_concert_id_47',
        references: { table: 'concerts', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_tickets', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_concert_tickets_user_id_48',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('concert_tickets', {
        fields: ['validated_by'],
        type: 'foreign key',
        name: 'fk_concert_tickets_validated_by_49',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('content_shares', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_content_shares_user_id_50',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('credit_purchases', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_credit_purchases_user_id_51',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_ads', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'fk_duel_ads_created_by_52',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_ads', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_duel_ads_duel_id_53',
        references: { table: 'duels', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_chat_messages', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_duel_chat_messages_duel_id_54',
        references: { table: 'duels', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_chat_messages', {
        fields: ['parent_id'],
        type: 'foreign key',
        name: 'fk_duel_chat_messages_parent_id_55',
        references: { table: 'duel_chat_messages', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_chat_messages', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_duel_chat_messages_user_id_56',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_reminders', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_duel_reminders_duel_id_57',
        references: { table: 'duels', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_reminders', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_duel_reminders_user_id_58',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_requests', {
        fields: ['manager_id'],
        type: 'foreign key',
        name: 'fk_duel_requests_manager_id_59',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_requests', {
        fields: ['opponent_id'],
        type: 'foreign key',
        name: 'fk_duel_requests_opponent_id_60',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_requests', {
        fields: ['requester_id'],
        type: 'foreign key',
        name: 'fk_duel_requests_requester_id_61',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_tickets', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_duel_tickets_duel_id_62',
        references: { table: 'duels', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_tickets', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_duel_tickets_user_id_63',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_votes', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_duel_votes_artist_id_64',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_votes', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_duel_votes_duel_id_65',
        references: { table: 'duels', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duel_votes', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_duel_votes_user_id_66',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duels', {
        fields: ['artist1_id'],
        type: 'foreign key',
        name: 'fk_duels_artist1_id_67',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duels', {
        fields: ['artist2_id'],
        type: 'foreign key',
        name: 'fk_duels_artist2_id_68',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duels', {
        fields: ['manager_id'],
        type: 'foreign key',
        name: 'fk_duels_manager_id_69',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('duels', {
        fields: ['winner_id'],
        type: 'foreign key',
        name: 'fk_duels_winner_id_70',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('email_notification_preferences', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_email_notification_preferences_user_id_71',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('fan_subscriptions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_fan_subscriptions_user_id_72',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('gift_conversions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_gift_conversions_user_id_73',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('gift_transactions', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_gift_transactions_duel_id_74',
        references: { table: 'duels', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('gift_transactions', {
        fields: ['from_user_id'],
        type: 'foreign key',
        name: 'fk_gift_transactions_from_user_id_75',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('gift_transactions', {
        fields: ['to_user_id'],
        type: 'foreign key',
        name: 'fk_gift_transactions_to_user_id_76',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('leaderboard_rewards', {
        fields: ['virtual_gift_id'],
        type: 'foreign key',
        name: 'fk_leaderboard_rewards_virtual_gift_id_77',
        references: { table: 'virtual_gifts', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('lifestyle_videos', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_lifestyle_videos_artist_id_78',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('live_chat_messages', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_live_chat_messages_user_id_79',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('live_join_requests', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_live_join_requests_user_id_80',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('live_reports', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_live_reports_reviewed_by_81',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('live_reports', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_live_reports_user_id_82',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('manager_profiles', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_manager_profiles_user_id_83',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('manager_requests', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_manager_requests_reviewed_by_84',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('manager_requests', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_manager_requests_user_id_85',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('moneroo_transactions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_moneroo_transactions_user_id_86',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('notifications', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_notifications_user_id_87',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('push_subscriptions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_push_subscriptions_user_id_88',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('referrals', {
        fields: ['referred_id'],
        type: 'foreign key',
        name: 'fk_referrals_referred_id_89',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('referrals', {
        fields: ['referrer_id'],
        type: 'foreign key',
        name: 'fk_referrals_referrer_id_90',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_access', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_replay_access_user_id_91',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_likes', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_replay_likes_user_id_92',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_videos', {
        fields: ['artist_id'],
        type: 'foreign key',
        name: 'fk_replay_videos_artist_id_93',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_videos', {
        fields: ['competition_id'],
        type: 'foreign key',
        name: 'fk_replay_videos_competition_id_94',
        references: { table: 'competitions', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_videos', {
        fields: ['concert_id'],
        type: 'foreign key',
        name: 'fk_replay_videos_concert_id_95',
        references: { table: 'concerts', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_videos', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'fk_replay_videos_created_by_96',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('replay_videos', {
        fields: ['duel_id'],
        type: 'foreign key',
        name: 'fk_replay_videos_duel_id_97',
        references: { table: 'duels', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('revenue_distributions', {
        fields: ['artist1_id'],
        type: 'foreign key',
        name: 'fk_revenue_distributions_artist1_id_98',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('revenue_distributions', {
        fields: ['artist2_id'],
        type: 'foreign key',
        name: 'fk_revenue_distributions_artist2_id_99',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('revenue_distributions', {
        fields: ['manager_id'],
        type: 'foreign key',
        name: 'fk_revenue_distributions_manager_id_100',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('season_winners', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_season_winners_user_id_101',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('sponsor_requests', {
        fields: ['requester_id'],
        type: 'foreign key',
        name: 'fk_sponsor_requests_requester_id_102',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('sponsor_requests', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_sponsor_requests_reviewed_by_103',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_badges', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_badges_user_id_104',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_currency_preferences', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_currency_preferences_user_id_105',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_gifts', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_gifts_user_id_106',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_payout_methods', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_payout_methods_user_id_107',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_roles', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_roles_user_id_108',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_ui_preferences', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_ui_preferences_user_id_109',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_wallets', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_wallets_user_id_110',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('user_withdrawal_pins', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_withdrawal_pins_user_id_111',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('video_interactions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_video_interactions_user_id_112',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('webrtc_signaling', {
        fields: ['sender_id'],
        type: 'foreign key',
        name: 'fk_webrtc_signaling_sender_id_113',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('withdrawal_pin_reset_tokens', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_withdrawal_pin_reset_tokens_user_id_114',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('withdrawal_requests', {
        fields: ['processed_by'],
        type: 'foreign key',
        name: 'fk_withdrawal_requests_processed_by_115',
        references: { table: 'users', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction,
      });
      await queryInterface.addConstraint('withdrawal_requests', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_withdrawal_requests_user_id_116',
        references: { table: 'users', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('withdrawal_requests', { transaction });
      await queryInterface.dropTable('withdrawal_pin_reset_tokens', { transaction });
      await queryInterface.dropTable('webrtc_signaling', { transaction });
      await queryInterface.dropTable('virtual_gifts', { transaction });
      await queryInterface.dropTable('video_interactions', { transaction });
      await queryInterface.dropTable('user_withdrawal_pins', { transaction });
      await queryInterface.dropTable('user_wallets', { transaction });
      await queryInterface.dropTable('user_ui_preferences', { transaction });
      await queryInterface.dropTable('user_roles', { transaction });
      await queryInterface.dropTable('user_payout_methods', { transaction });
      await queryInterface.dropTable('user_gifts', { transaction });
      await queryInterface.dropTable('user_currency_preferences', { transaction });
      await queryInterface.dropTable('user_badges', { transaction });
      await queryInterface.dropTable('subscription_plans', { transaction });
      await queryInterface.dropTable('stream_bans', { transaction });
      await queryInterface.dropTable('sponsor_requests', { transaction });
      await queryInterface.dropTable('sponsor_price_tiers', { transaction });
      await queryInterface.dropTable('sponsor_ad_videos', { transaction });
      await queryInterface.dropTable('sponsor_ad_plays', { transaction });
      await queryInterface.dropTable('season_winners', { transaction });
      await queryInterface.dropTable('revenue_distributions', { transaction });
      await queryInterface.dropTable('replay_videos', { transaction });
      await queryInterface.dropTable('replay_likes', { transaction });
      await queryInterface.dropTable('replay_access', { transaction });
      await queryInterface.dropTable('referrals', { transaction });
      await queryInterface.dropTable('push_subscriptions', { transaction });
      await queryInterface.dropTable('profiles', { transaction });
      await queryInterface.dropTable('platform_settings', { transaction });
      await queryInterface.dropTable('notifications', { transaction });
      await queryInterface.dropTable('moneroo_transactions', { transaction });
      await queryInterface.dropTable('manager_requests', { transaction });
      await queryInterface.dropTable('manager_profiles', { transaction });
      await queryInterface.dropTable('live_reports', { transaction });
      await queryInterface.dropTable('live_likes', { transaction });
      await queryInterface.dropTable('live_join_requests', { transaction });
      await queryInterface.dropTable('live_chat_messages', { transaction });
      await queryInterface.dropTable('lifestyle_videos', { transaction });
      await queryInterface.dropTable('leaderboard_seasons', { transaction });
      await queryInterface.dropTable('leaderboard_rewards', { transaction });
      await queryInterface.dropTable('gift_transactions', { transaction });
      await queryInterface.dropTable('gift_conversions', { transaction });
      await queryInterface.dropTable('fan_subscriptions', { transaction });
      await queryInterface.dropTable('exchange_rates', { transaction });
      await queryInterface.dropTable('email_notification_preferences', { transaction });
      await queryInterface.dropTable('duels', { transaction });
      await queryInterface.dropTable('duel_votes', { transaction });
      await queryInterface.dropTable('duel_tickets', { transaction });
      await queryInterface.dropTable('duel_requests', { transaction });
      await queryInterface.dropTable('duel_reminders', { transaction });
      await queryInterface.dropTable('duel_chat_messages', { transaction });
      await queryInterface.dropTable('duel_ads', { transaction });
      await queryInterface.dropTable('credit_purchases', { transaction });
      await queryInterface.dropTable('content_shares', { transaction });
      await queryInterface.dropTable('concerts', { transaction });
      await queryInterface.dropTable('concert_tickets', { transaction });
      await queryInterface.dropTable('concert_reminders', { transaction });
      await queryInterface.dropTable('concert_dedications', { transaction });
      await queryInterface.dropTable('concert_chat_messages', { transaction });
      await queryInterface.dropTable('competitions', { transaction });
      await queryInterface.dropTable('competition_votes', { transaction });
      await queryInterface.dropTable('competition_tickets', { transaction });
      await queryInterface.dropTable('competition_reports', { transaction });
      await queryInterface.dropTable('competition_gifts', { transaction });
      await queryInterface.dropTable('competition_chat_messages', { transaction });
      await queryInterface.dropTable('competition_candidates', { transaction });
      await queryInterface.dropTable('competition_bans', { transaction });
      await queryInterface.dropTable('competition_ads', { transaction });
      await queryInterface.dropTable('comments', { transaction });
      await queryInterface.dropTable('comment_likes', { transaction });
      await queryInterface.dropTable('cinetpay_transactions', { transaction });
      await queryInterface.dropTable('cinetpay_countries', { transaction });
      await queryInterface.dropTable('cinetpay_alerts', { transaction });
      await queryInterface.dropTable('blogs', { transaction });
      await queryInterface.dropTable('artist_requests', { transaction });
      await queryInterface.dropTable('artist_profiles', { transaction });
      await queryInterface.dropTable('artist_lives', { transaction });
      await queryInterface.dropTable('artist_followers', { transaction });
      await queryInterface.dropTable('artist_concerts', { transaction });
      await queryInterface.dropTable('admin_logs', { transaction });
      await queryInterface.dropTable('account_warnings', { transaction });
      await queryInterface.dropTable('account_reports', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    } finally {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  },
};
