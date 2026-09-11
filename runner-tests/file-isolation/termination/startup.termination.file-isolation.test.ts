import { expect, test } from 'vitest';

// The parent verifier needs the child Vitest process to collect a test file so
// its setup hook runs. Application bootstrap hangs before this body is reached.
// All cleanup assertions live in forced-termination.verifier.test.ts.
test('sentinel remains unreachable while application bootstrap is hung', () => {
  expect.unreachable('application bootstrap unexpectedly completed');
});
