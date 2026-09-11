import { expect, test } from 'vitest';

test('does not run while application bootstrap is hung', () => {
  expect.unreachable('the application start hook should still be pending');
});
