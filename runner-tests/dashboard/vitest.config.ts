import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

const fixture = process.env.DASHBOARD_FIXTURE_KIND ?? 'passing';

export default defineContainerProject({
  dashboard: {
    open: false,
    outputDirectory: `test-results/dashboard-runner-fixtures/vitest-${fixture}`,
  },
  include: [`runner-tests/dashboard/${fixture}-vitest/*.dashboard.test.ts`],
  containers: {},
  vitest: {
    maxWorkers: 2,
    testTimeout: 5_000,
  },
});
