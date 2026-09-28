import { fromContainer } from '@integration-testing/testcontainers';
import { defineAnnotationProject } from '@integration-testing/testcontainers/jest';

export default defineAnnotationProject({
  dashboard: {
    open: false,
    outputDirectory: `test-results/dashboard-docker/${process.env.FILE_ISOLATION_SUITE ?? 'jest-annotation'}`,
  },
  include: ['**/runner-tests/file-isolation/jest-annotation/*.jest-annotation.file-isolation.test.ts'],
  testFileSuffix: '.jest-annotation.file-isolation.test.ts',
  application: {
    setup: './runner-tests/file-isolation/support/jest-application.setup.ts',
    environment: {
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
      DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
      AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
    },
  },
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
    testTimeout: 60_000,
  },
});
