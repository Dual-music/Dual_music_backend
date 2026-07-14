/**
 * @file Global test setup. Runs BEFORE any test module is imported, so it can
 * force the test environment (in-memory SQLite, Redis disabled) before
 * `config/env.js` reads `process.env`.
 */
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.REDIS_OPTIONAL = 'true';
process.env.TOKEN_HASH_SECRET = 'test_token_hash_secret_value_1234567890';
process.env.OTP_TTL_SECONDS = '600';
// Stripe: only the Premium price is configured, so subscription tests can cover
// both the configured (premium) and the not-configured (pro) branches.
process.env.STRIPE_PRICE_PREMIUM = 'price_premium_test';
process.env.STRIPE_PRICE_PRO = '';
