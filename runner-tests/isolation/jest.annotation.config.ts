import { fromContainer } from '@integration-testing/testcontainers';
import { defineAnnotationProject } from '@integration-testing/testcontainers/jest';

export default defineAnnotationProject({
  include: ['**/runner-tests/isolation/jest-annotation/*.jest-annotation.file-isolation.test.ts'],
  testFileSuffix: '.jest-annotation.file-isolation.test.ts',
  application: {
    setup: './runner-tests/isolation/support/jest-application.setup.ts',
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
        tsconfig: './runner-tests/isolation/tsconfig.jest.json',
        useESM: false,
      }],
    },
    testTimeout: 60_000,
  },
});
