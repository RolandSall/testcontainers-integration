import { describe, expect, test } from 'vitest';
import { parseContainerIsolation } from './container-isolation.js';

describe('container isolation', () => {
  test.each(['shared', 'dedicated'] as const)('accepts %s', (isolation) => {
    expect(parseContainerIsolation(isolation)).toBe(isolation);
  });

  test.each([
    undefined,
    null,
    {},
    'isolated',
    2,
  ])('rejects missing, malformed, or conflicting isolation: %j', (input) => {
    expect(() => parseContainerIsolation(input)).toThrow('Container isolation must be');
  });
});
