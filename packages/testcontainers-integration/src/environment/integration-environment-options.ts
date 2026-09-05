import type { ContainerKind } from '../container-resource-map.js';
import type { ContainerResources } from '../container-resources.js';
import type { ApplicationLifecycle } from './application-lifecycle.js';
import type { ContainerSource } from './container-source.js';
import type { IntegrationTestLogger } from '../logging/integration-test-logger.js';

/** Dependencies and requirements used to build an integration environment. */
export interface IntegrationEnvironmentOptions<TApplication> {
  /** Container kinds that must be ready before the application starts. */
  readonly requiredContainers: readonly ContainerKind[];
  /** Owned or provided source of container resources. */
  readonly containers: ContainerSource;
  /** Optional preparation that completes after containers start and before the application starts. */
  readonly prepareResources?: (resources: ContainerResources) => Promise<void>;
  /** Application startup and shutdown callbacks. */
  readonly application: ApplicationLifecycle<TApplication>;
  /** Optional lifecycle logger. */
  readonly logger?: IntegrationTestLogger;
}
