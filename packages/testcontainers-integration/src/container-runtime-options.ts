import type { ContainerNetworkFactory } from './network/container-network-factory.js';
import type { IntegrationTestLogger } from './logging/integration-test-logger.js';
import type { IntegrationTestEventSink } from './dashboard/dashboard-event.js';

export interface ContainerRuntimeEventContext {
  readonly isolation?: 'shared' | 'dedicated';
  readonly filePath?: string;
}

/** Optional adapters used by `ContainerRuntime`. */
export interface ContainerRuntimeOptions {
  /** Creates the shared network. Defaults to the Testcontainers implementation. */
  readonly networkFactory?: ContainerNetworkFactory;
  /** Receives runtime events. Defaults to the timestamped console logger. */
  readonly logger?: IntegrationTestLogger;
  /** Streams raw container output. Disabled by default to keep test output concise. */
  readonly containerLogs?: boolean;
  /** Receives safe structured lifecycle events for diagnostics. */
  readonly eventSink?: IntegrationTestEventSink;
  /** Correlates runtime events with their file and isolation scope. */
  readonly eventContext?: ContainerRuntimeEventContext;
}
