import { fromContainer, postgreSql } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['runner-tests/file-isolation/termination/*.termination.file-isolation.test.ts'],
  containers: {
    sharedDatabase: postgreSql({
      isolation: 'shared',
      database: 'shared_termination_app',
    }),
    dedicatedDatabase: postgreSql({
      isolation: 'dedicated',
      database: 'dedicated_termination_app',
    }),
  },
  application: {
    setup: './runner-tests/file-isolation/termination/application.setup.ts',
    environment: {
      SHARED_DATABASE_URL: fromContainer('sharedDatabase', 'connectionUri'),
      DATABASE_URL: fromContainer('dedicatedDatabase', 'connectionUri'),
    },
  },
  hookTimeout: 600_000,
  testTimeout: 30_000,
  vitest: { maxWorkers: 1 },
});
