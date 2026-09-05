import type { Config } from 'jest';

const config: Config = {
  rootDir: '../..',
  testMatch: ['<rootDir>/runner-tests/jest/**/*.runner.test.ts'],
  globalSetup: '<rootDir>/runner-tests/jest/global-setup.ts',
  globalTeardown: '<rootDir>/runner-tests/jest/global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/runner-tests/jest/application.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/runner-tests/jest/tsconfig.jest.json', useESM: false },
    ],
  },
};

export default config;
