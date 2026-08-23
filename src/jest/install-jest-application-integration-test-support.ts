import { consumeApplicationIntegrationTestClass } from '../application-integration-test.js';
import type { ApplicationIntegrationTestContextAccessor } from '../environment/application-integration-test-context-accessor.js';
import { ApplicationIntegrationTestContextManager } from '../environment/application-integration-test-context-manager.js';
import type { ApplicationLifecycle } from '../environment/application-lifecycle.js';
import { injectedContainerResources } from './injected-resources.js';

/**
 * Installs annotation-first application lifecycle hooks for one Jest project.
 *
 * Call this once from a module configured through Jest `setupFilesAfterEnv`.
 */
export const installJestApplicationIntegrationTestSupport = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> => {
  const hooks = jestHooks();
  const contextManager = new ApplicationIntegrationTestContextManager(lifecycle);
  let active = false;

  hooks.beforeAll(async () => {
    const testClass = consumeApplicationIntegrationTestClass();
    if (testClass === undefined) {
      return;
    }
    await contextManager.start(testClass, injectedContainerResources());
    active = true;
  });

  hooks.afterAll(async () => {
    if (!active) {
      return;
    }
    try {
      await contextManager.stop();
    } finally {
      active = false;
    }
  });

  return contextManager;
};

interface JestHooks {
  beforeAll(action: () => Promise<void>): void;
  afterAll(action: () => Promise<void>): void;
}

const jestHooks = (): JestHooks => {
  const candidate = globalThis as typeof globalThis & Partial<JestHooks>;
  if (
    typeof candidate.beforeAll !== 'function' ||
    typeof candidate.afterAll !== 'function'
  ) {
    throw new Error(
      'Jest application support must be installed through setupFilesAfterEnv',
    );
  }
  return {
    beforeAll: candidate.beforeAll.bind(candidate),
    afterAll: candidate.afterAll.bind(candidate),
  };
};
