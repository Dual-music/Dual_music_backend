import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat ESLint configuration (ESLint 9).
 * Enforces a professional, consistent Node/ESM codebase; Prettier owns formatting.
 */
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { import: importPlugin },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'import/order': [
        'warn',
        { 'newlines-between': 'always', alphabetize: { order: 'asc' } },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  prettier,
];
