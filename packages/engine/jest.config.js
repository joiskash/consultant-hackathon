/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/tests/integration/'],
  setupFiles: ['<rootDir>/tests/unit-setup.ts'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
