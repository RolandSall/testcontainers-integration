import { defineConfig } from 'vitest/config';
import { Container } from './src/container-kind.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './src/vitest/context-key.js';

export default defineConfig({
  test: {
    setupFiles: [
      './src/vitest/application-integration-test.setup.test-helper.ts',
    ],
    provide: {
      [CONTAINER_RESOURCES_CONTEXT_KEY]: {
        [Container.SqlServer]: {
          kind: Container.SqlServer,
          host: '127.0.0.1',
          port: 14_333,
          username: 'sa',
          password: 'Container!Sql2026',
          database: 'master',
        },
      },
    },
  },
});
