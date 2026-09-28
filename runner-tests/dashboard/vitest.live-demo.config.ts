import { postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  dashboard: {
    open: false,
    outputDirectory: 'test-results/dashboard-live-demo',
  },
  containerLogs: true,
  include: ['runner-tests/dashboard/live-demo/*.dashboard.test.ts'],
  containers: {
    messages: rabbitMq({ isolation: 'shared', startupTimeoutMs: 300_000 }),
    database: postgreSql({ isolation: 'dedicated' }),
  },
  hookTimeout: 300_000,
  testTimeout: 130_000,
  vitest: { maxWorkers: 1 },
});
