import { resolve } from 'node:path';
import { createDefaultContainerRegistry } from '@integration-testing/testcontainers';
import { createJestContainerGlobalSetup } from '@integration-testing/testcontainers/jest';

export const lifecycle = createJestContainerGlobalSetup({
  root: resolve(__dirname, '..'),
  registry: createDefaultContainerRegistry(),
});
