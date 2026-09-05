import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['runner-tests/vitest/**/*.runner.test.ts'],
    globalSetup: ['./runner-tests/vitest/global-setup.ts'],
    setupFiles: ['./runner-tests/vitest/application.setup.ts'],
  },
});
