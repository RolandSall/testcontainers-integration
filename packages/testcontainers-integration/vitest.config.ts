import { defineConfig } from 'vitest/config';
import { Container } from './src/container-kind.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './src/vitest/context-key.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from './src/project-context.js';

export default defineConfig({
  test: {
    setupFiles: [
      './src/vitest/file-setup.ts',
      './src/vitest/application-integration-test.setup.test-helper.ts',
    ],
    sequence: { setupFiles: 'list', hooks: 'stack' },
    provide: {
      [CONTAINER_RESOURCES_CONTEXT_KEY]: {
        database: {
            kind: Container.SqlServer,
            host: '127.0.0.1',
            port: 14_333,
            username: 'sa',
            password: 'Container!Sql2026',
            database: 'master',
        },
      },
      [ANNOTATION_PROJECT_CONTEXT_KEY]: { version: 2 },
    },
  },
});
