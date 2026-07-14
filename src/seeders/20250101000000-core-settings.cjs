/* eslint-disable */
'use strict';

/**
 * Core seed data required for the platform to function:
 *  - platform_settings: welcome_config (credits granted on signup)
 *  - virtual_gifts: the default gift catalog (matches the frontend defaults)
 * Idempotent-ish: uses INSERT ... ON DUPLICATE KEY for settings; gifts are keyed
 * by name to avoid duplicates on re-run.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // Revenue-split configuration consumed by distribute_event_revenue.
    // Percentages are per source type; sponsor sections default to disabled
    // (100% platform). Tune in the admin panel (EconomicConfigManager).
    const economicConfig = {
      vote: { platform_pct: 20 },
      gift: { platform_pct: 20 },
      concert_ticket: { platform_pct: 20, artist_pct: 80 },
      concert_replay: { platform_pct: 20, artist_pct: 80 },
      duel_ticket: { platform_pct: 20, artists_pct: 70, manager_pct: 10, winner_share_pct: 50 },
      duel_replay: { platform_pct: 20, artists_pct: 70, manager_pct: 10, winner_share_pct: 50 },
      sponsor_concert: { enabled: false, platform_pct: 20, artist_pct: 80 },
      sponsor_duel: { enabled: false, platform_pct: 20, artists_pct: 70, manager_pct: 10 },
    };

    await queryInterface.bulkInsert(
      'platform_settings',
      [
        { key: 'welcome_config', value: JSON.stringify({ welcome_credits: 100 }), updated_at: now },
        { key: 'economic_config', value: JSON.stringify(economicConfig), updated_at: now },
      ],
      { ignoreDuplicates: true },
    );

    const gifts = [
      ['Rose', 10, '🌹'],
      ['Coeur', 25, '❤️'],
      ['Étoile', 50, '⭐'],
      ['Diamant', 100, '💎'],
      ['Couronne', 250, '👑'],
      ['Fusée', 500, '🚀'],
      ['Trophée', 1000, '🏆'],
    ];
    // Only insert gifts that are not already present (by name).
    const [existing] = await queryInterface.sequelize.query('SELECT name FROM virtual_gifts');
    const present = new Set(existing.map((r) => r.name));
    const rows = gifts
      .filter(([name]) => !present.has(name))
      .map(([name, price, image_url]) => ({
        id: Sequelize.literal('(UUID())'),
        name,
        price,
        image_url,
        created_at: now,
      }));
    if (rows.length) {
      // bulkInsert cannot use Sequelize.literal per-row for id on all versions;
      // insert individually to allow UUID() default.
      for (const row of rows) {
        await queryInterface.sequelize.query(
          'INSERT INTO virtual_gifts (id, name, price, image_url, created_at) VALUES (UUID(), ?, ?, ?, ?)',
          { replacements: [row.name, row.price, row.image_url, now] },
        );
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('platform_settings', { key: 'welcome_config' });
    await queryInterface.bulkDelete('virtual_gifts', {
      name: ['Rose', 'Coeur', 'Étoile', 'Diamant', 'Couronne', 'Fusée', 'Trophée'],
    });
  },
};
