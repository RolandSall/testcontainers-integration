import { afterAll, beforeAll } from 'vitest';
import { consumeApplicationIntegrationTestClass } from '../application-integration-test.js';
import type { ApplicationIntegrationTestContextAccessor } from '../environment/application-integration-test-context-accessor.js';
import { ApplicationIntegrationTestContextManager } from '../environment/application-integration-test-context-manager.js';
import type { ApplicationLifecycle } from '../environment/application-lifecycle.js';
import { injectedContainerResources } from './injected-resources.js';

/**
 * Installs annotation-first application lifecycle hooks for one Vitest project.
 *
 * Call this once from a module configured through Vitest `setupFiles`. Annotated test files
 * receive the returned typed application accessor without registering hooks themselves.
 */
export const installVitestApplicationIntegrationTestSupport = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> => {
  const contextManager = new ApplicationIntegrationTestContextManager(lifecycle);
  let active = false;

  beforeAll(async () => {
    const testClass = consumeApplicationIntegrationTestClass();
    if (testClass === undefined) {
      return;
    }
    await contextManager.start(testClass, injectedContainerResources());
    active = true;
  });

  afterAll(async () => {
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
