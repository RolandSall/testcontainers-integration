import {
  fromContainer,
  postgreSql,
  rabbitMq,
} from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  dashboard: {
    open: false,
    outputDirectory: `test-results/dashboard-docker/${process.env.FILE_ISOLATION_SUITE ?? 'vitest-project'}`,
  },
  include: ['runner-tests/file-isolation/vitest-project/*.project.file-isolation.test.ts'],
  containers: {
    messages: rabbitMq({ isolation: 'shared', startupTimeoutMs: 300_000 }),
    primaryDatabase: postgreSql({ isolation: 'dedicated', database: 'primary_app' }),
    auditDatabase: postgreSql({ isolation: 'dedicated', database: 'audit_app' }),
  },
  application: {
    setup: './runner-tests/file-isolation/support/vitest-application.setup.ts',
    environment: {
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
      DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
      AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
    },
  },
  hookTimeout: 360_000,
  testTimeout: 60_000,
  vitest: { maxWorkers: 2 },
});
