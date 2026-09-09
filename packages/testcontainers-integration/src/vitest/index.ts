export { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
export { createVitestContainerGlobalSetup } from './global-setup.js';
export type {
  VitestContainerGlobalSetup,
  VitestContainerGlobalSetupOptions,
  VitestGlobalSetupProject,
} from './global-setup.js';
export { injectedContainerProject, injectedContainerResources } from './injected-resources.js';
export { discoverRequiredContainers } from './required-container-scanner.js';
export type { RequiredContainerDiscoveryOptions } from './required-container-scanner.js';
export { installVitestApplicationIntegrationTestSupport } from './install-vitest-application-integration-test-support.js';
export { configureVitestContainerFileSupport } from './file-lifecycle.js';
export type { VitestContainerFileSupportOptions } from './file-lifecycle.js';
export {
  defineAnnotationProject,
  defineVitestAnnotationProject,
} from './define-annotation-project.js';
export type { VitestAnnotationProjectOptions } from './define-annotation-project.js';
export {
  defineContainerProject,
  defineVitestContainerProject,
} from './define-container-project.js';
export type { VitestContainerProjectOptions } from './define-container-project.js';
