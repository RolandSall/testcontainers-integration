import type { ContainerResource } from './container-contract.js';
import type { Container } from './container-kind.js';
import type { ContainerKind } from './container-resource-map.js';
import { ContainerResources } from './container-resources.js';
import type { ContainerRegistry } from './container-registry.js';
import type { ContainerRuntimeOptions } from './container-runtime-options.js';
import { consoleIntegrationTestLogger } from './logging/console-integration-test-logger.js';
import type { IntegrationTestLogger } from './logging/integration-test-logger.js';
import type { ContainerNetwork } from './network/container-network.js';
import type { ContainerNetworkFactory } from './network/container-network-factory.js';
import { startTestcontainersNetwork } from './network/testcontainers-network.js';

interface RuntimeEntry {
  readonly container: Container<ContainerResource>;
  readonly resource: Promise<ContainerResource>;
}

/**
 * Owns one shared network and one started container per required kind.
 *
 * Concurrent and repeated `start()` calls reuse the same start promises. `stop()` is
 * idempotent and releases containers before their shared network.
 */
export class ContainerRuntime {
  private readonly entries = new Map<ContainerKind, RuntimeEntry>();
  private readonly startedOrder: ContainerKind[] = [];
  private readonly networkFactory: ContainerNetworkFactory;
  private readonly logger: IntegrationTestLogger;
  private network: ContainerNetwork | undefined;
  private networkPromise: Promise<ContainerNetwork> | undefined;
  private stopPromise: Promise<void> | undefined;

  /** Creates a runtime backed by the supplied registry and optional infrastructure adapters. */
  constructor(
    private readonly registry: ContainerRegistry,
    options: ContainerRuntimeOptions = {},
  ) {
    this.networkFactory = options.networkFactory ?? startTestcontainersNetwork;
    this.logger = options.logger ?? consoleIntegrationTestLogger;
  }

  /**
   * Starts every unique required kind and returns their typed resources.
   *
   * Containers share one network and start concurrently. A partial failure triggers cleanup
   * before the original error is rethrown.
   */
  async start(kinds: readonly ContainerKind[]): Promise<ContainerResources> {
    if (this.stopPromise !== undefined) {
      throw new Error('Container runtime has already been stopped');
    }

    const uniqueKinds = [...new Set(kinds)];
    if (uniqueKinds.length > 0) {
      try {
        const network = await this.startNetwork();
        await Promise.all(
          uniqueKinds.map((kind) => this.startKind(kind, network)),
        );
      } catch (error) {
        await this.stop();
        throw error;
      }
    } else {
      this.logger.info('runtime', 'no required containers discovered');
    }

    const resources = await Promise.all(
      [...this.entries.values()].map((entry) => entry.resource),
    );
    return new ContainerResources(resources);
  }

  /** Stops all owned containers in reverse order, then stops the shared network. */
  stop(): Promise<void> {
    this.stopPromise ??= this.stopAll();
    return this.stopPromise;
  }

  private startNetwork(): Promise<ContainerNetwork> {
    this.networkPromise ??= this.startNetworkOnce();
    return this.networkPromise;
  }

  private async startNetworkOnce(): Promise<ContainerNetwork> {
    this.logger.info('runtime', 'creating shared container network');
    try {
      const network = await this.networkFactory();
      this.network = network;
      this.logger.info('runtime', 'shared container network is ready');
      return network;
    } catch (error) {
      this.logger.error('runtime', 'shared container network failed to start', error);
      throw error;
    }
  }

  private startKind(
    kind: ContainerKind,
    network: ContainerNetwork,
  ): Promise<ContainerResource> {
    const existing = this.entries.get(kind);
    if (existing !== undefined) {
      return existing.resource;
    }

    const container = this.registry.create(kind) as Container<ContainerResource>;
    this.logger.info('runtime', `starting ${kind} container`);
    const resource = container
      .start({ network, networkAliases: [kind], logger: this.logger })
      .then((startedResource) => {
        this.startedOrder.push(kind);
        this.logger.info('runtime', `${kind} container is ready`);
        return startedResource;
      })
      .catch((error: unknown) => {
        this.logger.error('runtime', `${kind} container failed to start`, error);
        throw error;
      });
    this.entries.set(kind, { container, resource });
    return resource;
  }

  private async stopAll(): Promise<void> {
    const failures: unknown[] = [];
    const pendingKinds = [...this.entries.keys()].filter(
      (kind) => !this.startedOrder.includes(kind),
    );
    const order = [...this.startedOrder, ...pendingKinds].reverse();

    for (const kind of order) {
      const entry = this.entries.get(kind);
      if (entry === undefined) {
        continue;
      }
      try {
        this.logger.info('runtime', `stopping ${kind} container`);
        await entry.container.stop();
        this.logger.info('runtime', `${kind} container stopped`);
      } catch (error) {
        this.logger.error('runtime', `${kind} container failed to stop`, error);
        failures.push(error);
      }
    }

    let activeNetwork = this.network;
    if (activeNetwork === undefined && this.networkPromise !== undefined) {
      try {
        activeNetwork = await this.networkPromise;
      } catch {
        activeNetwork = undefined;
      }
    }
    this.network = undefined;
    if (activeNetwork !== undefined) {
      try {
        this.logger.info('runtime', 'stopping shared container network');
        await activeNetwork.stop();
        this.logger.info('runtime', 'shared container network stopped');
      } catch (error) {
        this.logger.error('runtime', 'shared container network failed to stop', error);
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        'One or more containers or their network failed to stop',
      );
    }
  }
}
