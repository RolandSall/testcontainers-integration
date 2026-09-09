import { expect, expectTypeOf, test, vi } from 'vitest';
import { installJestApplicationIntegrationTestSupport } from './install-jest-application-integration-test-support.js';

interface FakeApplication {
  readonly listening: boolean;
}

test('registers a typed application lifecycle for the package-owned Jest file hooks', () => {
  const beforeAll = vi.fn();
  const afterAll = vi.fn();
  vi.stubGlobal('beforeAll', beforeAll);
  vi.stubGlobal('afterAll', afterAll);
  try {
    const context = installJestApplicationIntegrationTestSupport<FakeApplication>({
      start: () => Promise.resolve({ listening: true }),
      stop: () => Promise.resolve(),
    });

    expectTypeOf(context.current).returns.toEqualTypeOf<FakeApplication>();
    expect(() => context.current()).toThrow('Application integration-test context is not active');
    expect(beforeAll).toHaveBeenCalledOnce();
    expect(afterAll).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
