import { createDefaultContainerRegistry } from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';

const lifecycle = createVitestContainerGlobalSetup({
  root: new URL('..', import.meta.url).pathname,
  registry: createDefaultContainerRegistry(),
});

export const setup = lifecycle.setup;
export const teardown = lifecycle.teardown;
