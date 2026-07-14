import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration. Integration tests run against an in-memory SQLite
 * database (see `tests/setup.js`) for pure-ORM modules; MySQL-specific flows
 * (stored procedures) are covered by container-based tests in CI.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/openapi/**', 'src/db/**', 'src/config/**'],
      // §5: 100% coverage is mandatory on the money modules.
      thresholds: {
        'src/services/wallet.service.js': { lines: 100, functions: 100, branches: 90, statements: 100 },
        'src/services/payments/payments.service.js': { lines: 100, functions: 100, branches: 90, statements: 100 },
        'src/services/payments/pricing.service.js': { lines: 100, functions: 100, branches: 90, statements: 100 },
      },
    },
  },
});
