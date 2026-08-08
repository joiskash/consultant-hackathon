/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  testPathIgnorePatterns: [],
  // Integration tests need the real DB — do NOT clear DATABASE_URL.
  setupFiles: [],
};
