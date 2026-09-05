import type { ContainerNetwork } from './network/container-network.js';
import type { IntegrationTestLogger } from './logging/integration-test-logger.js';

/** Infrastructure supplied by the runtime when it starts a concrete container. */
export interface ContainerStartOptions {
  /** Shared network for communication between required containers. */
  readonly network?: ContainerNetwork;
  /** Stable names by which peer containers can reach this container. */
  readonly networkAliases?: readonly string[];
  /** Logger that receives lifecycle and container-output events. */
  readonly logger?: IntegrationTestLogger;
}
