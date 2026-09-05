import type { Config } from 'jest';

const config: Config = {
  testMatch: ['**/*.container.integration.test.ts'],
  globalSetup: './test/jest.container.global-setup.ts',
  globalTeardown: './test/jest.container.global-teardown.ts',
  setupFilesAfterEnv: ['./test/application.jest.setup.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.jest.json', useESM: false }],
  },
};

export default config;
