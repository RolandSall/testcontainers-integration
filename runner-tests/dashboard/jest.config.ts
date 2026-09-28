import { defineContainerProject } from '@integration-testing/testcontainers/jest';

const fixture = process.env.DASHBOARD_FIXTURE_KIND ?? 'passing';

export default defineContainerProject({
  dashboard: {
    open: false,
    outputDirectory: `test-results/dashboard-runner-fixtures/jest-${fixture}`,
  },
  include: [`**/runner-tests/dashboard/${fixture}-jest/*.dashboard.test.ts`],
  containers: {},
  jest: {
    rootDir: '../..',
    maxWorkers: 2,
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', {
        tsconfig: './runner-tests/file-isolation/tsconfig.jest.json',
        useESM: false,
      }],
    },
    testTimeout: 5_000,
  },
});
