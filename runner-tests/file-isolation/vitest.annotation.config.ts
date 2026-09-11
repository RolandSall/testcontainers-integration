import { fromContainer } from '@integration-testing/testcontainers';
import { defineAnnotationProject } from '@integration-testing/testcontainers/vitest';

export default defineAnnotationProject({
  include: ['runner-tests/file-isolation/vitest-annotation/*.vitest-annotation.file-isolation.test.ts'],
  testFileSuffix: '.vitest-annotation.file-isolation.test.ts',
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
