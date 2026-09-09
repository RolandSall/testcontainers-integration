import {
  fromContainer,
  postgreSql,
  rabbitMq,
} from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/jest';

export default defineContainerProject({
  include: ['**/runner-tests/isolation/jest-project/*.project.file-isolation.test.ts'],
  containers: {
    messages: rabbitMq({ isolation: 'shared', startupTimeoutMs: 300_000 }),
    primaryDatabase: postgreSql({ isolation: 'dedicated', database: 'primary_app' }),
    auditDatabase: postgreSql({ isolation: 'dedicated', database: 'audit_app' }),
  },
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
