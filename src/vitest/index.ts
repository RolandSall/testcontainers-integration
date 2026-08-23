export { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
export { createVitestContainerGlobalSetup } from './global-setup.js';
export type {
  VitestContainerGlobalSetup,
  VitestContainerGlobalSetupOptions,
  VitestGlobalSetupProject,
} from './global-setup.js';
export { injectedContainerResources } from './injected-resources.js';
export { discoverRequiredContainers } from './required-container-scanner.js';
export type { RequiredContainerDiscoveryOptions } from './required-container-scanner.js';
export { installVitestApplicationIntegrationTestSupport } from './install-vitest-application-integration-test-support.js';
