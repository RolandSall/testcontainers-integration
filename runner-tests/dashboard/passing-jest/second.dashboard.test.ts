import { expect, test } from '@jest/globals';

test('dashboard records a parallel file', async () => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect('dashboard').toContain('board');
});
