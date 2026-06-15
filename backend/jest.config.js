/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/tests/**/*.test.ts'],
    clearMocks: true,
    // Silence the console.log() calls that live inside the domain models so the
    // test output stays focused on the assertions.
    silent: true,
};
