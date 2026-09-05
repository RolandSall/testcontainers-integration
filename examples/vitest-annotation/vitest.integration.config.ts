import { defineAnnotationProject } from '@integration-testing/testcontainers/vitest';

export default defineAnnotationProject({
  application: './test/application.vitest.setup.ts',
  hookTimeout: 360_000,
});
