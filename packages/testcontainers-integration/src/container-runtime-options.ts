import type { ContainerNetworkFactory } from './network/container-network-factory.js';
import type { IntegrationTestLogger } from './logging/integration-test-logger.js';

/** Optional adapters used by `ContainerRuntime`. */
export interface ContainerRuntimeOptions {
  /** Creates the shared network. Defaults to the Testcontainers implementation. */
  readonly networkFactory?: ContainerNetworkFactory;
  /** Receives runtime events. Defaults to the timestamped console logger. */
  readonly logger?: IntegrationTestLogger;
  /** Streams raw container output. Disabled by default to keep test output concise. */
  readonly containerLogs?: boolean;
}
