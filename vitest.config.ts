import { defineConfig } from 'vitest/config';

/**
 * Repository-root fallback for WebStorm gutter runs.
 *
 * Consumer applications should keep their own dedicated integration config. This file exists so
 * an IDE command launched from this workspace root still loads the example's container lifecycle.
 */
export default defineConfig({
  test: {
    include: ['examples/vitest-annotation/test/**/*.container.integration.test.ts'],
    globalSetup: ['./examples/vitest-annotation/test/vitest.container.global-setup.ts'],
    setupFiles: ['./examples/vitest-annotation/test/application.vitest.setup.ts'],
    hookTimeout: 360_000,
  },
});
