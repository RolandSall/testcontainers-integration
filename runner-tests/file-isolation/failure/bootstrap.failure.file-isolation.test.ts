import { expect, test } from 'vitest';

test('does not run after application bootstrap rejects', () => {
  expect.unreachable('the package beforeAll hook should reject first');
});
