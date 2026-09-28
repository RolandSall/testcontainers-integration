import { expect, test } from 'vitest';

test('dashboard records a passing test', async () => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(2 + 2).toBe(4);
});

test.skip('dashboard records a skipped test', () => undefined);
