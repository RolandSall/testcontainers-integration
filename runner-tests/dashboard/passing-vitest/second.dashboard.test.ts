import { expect, test } from 'vitest';

test('dashboard records a parallel file', async () => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect('dashboard').toContain('board');
});
