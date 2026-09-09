import {
  fromContainer,
  postgreSql,
  rabbitMq,
} from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['runner-tests/isolation/failure/*.failure.file-isolation.test.ts'],
  containers: {
    messages: rabbitMq({ isolation: 'shared', startupTimeoutMs: 300_000 }),
    database: postgreSql({ isolation: 'dedicated', database: 'failure_app' }),
  },
  application: {
    setup: './runner-tests/isolation/failure/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('database', 'connectionUri'),
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
    },
  },
  hookTimeout: 360_000,
  testTimeout: 30_000,
  vitest: { maxWorkers: 1 },
});
