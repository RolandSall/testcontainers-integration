import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'runner-tests/file-isolation/termination/forced-termination.verifier.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 720_000,
  },
});
