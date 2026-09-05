import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.container.integration.test.ts'],
    globalSetup: ['./test/vitest.container.global-setup.ts'],
    setupFiles: ['./test/application.vitest.setup.ts'],
    hookTimeout: 360_000,
  },
});
