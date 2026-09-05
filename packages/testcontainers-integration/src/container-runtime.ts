import type { ContainerResource } from './container-contract.js';
import type { Container } from './container-kind.js';
import type { ContainerKind } from './container-resource-map.js';
import { ContainerResources } from './container-resources.js';
import type { ContainerRegistry } from './container-registry.js';
import type { ContainerRuntimeOptions } from './container-runtime-options.js';
import { withCleanupFailures } from './cleanup-failure.js';
import { consoleIntegrationTestLogger } from './logging/console-integration-test-logger.js';
import type { IntegrationTestLogger } from './logging/integration-test-logger.js';
import type { ContainerNetwork } from './network/container-network.js';
import type { ContainerNetworkFactory } from './network/container-network-factory.js';
import { startTestcontainersNetwork } from './network/testcontainers-network.js';

interface RuntimeEntry {
  readonly name: string;
  readonly kind: ContainerKind;
  readonly container: Container<ContainerResource>;
  readonly resource: Promise<ContainerResource>;
}

export interface ContainerRuntimeInstance {
  readonly name: string;
  readonly kind: ContainerKind;
}

/**
 * Owns one shared network and one started container per required named instance.
 *
 * Concurrent and repeated `start()` calls reuse the same start promises. `stop()` is
 * idempotent and releases containers before their shared network.
 */
export class ContainerRuntime {
  private readonly entries = new Map<string, RuntimeEntry>();
  private readonly startedOrder: string[] = [];
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
    return this.startInstances(
      [...new Set(kinds)].map((kind) => ({ name: kind, kind })),
    );
  }

  /** Starts named instances, including multiple containers of the same kind. */
  async startInstances(
    instances: readonly ContainerRuntimeInstance[],
  ): Promise<ContainerResources> {
    if (this.stopPromise !== undefined) {
      throw new Error('Container runtime has already been stopped');
    }

    const names = new Set<string>();
    for (const instance of instances) {
      if (names.has(instance.name)) {
        throw new Error(`Container instance name is duplicated: ${instance.name}`);
      }
      names.add(instance.name);
    }
    if (instances.length > 0) {
      try {
        const network = await this.startNetwork();
        await Promise.all(
          instances.map((instance) => this.startInstance(instance, network)),
        );
      } catch (error) {
        try {
          await this.stop();
        } catch (cleanupError) {
          throw withCleanupFailures(
            error,
            [cleanupError],
            'Container startup failed and cleanup also failed',
          );
        }
        throw error;
      }
    } else {
      this.logger.info('runtime', 'no required containers discovered');
    }

    const resources = await Promise.all(
      [...this.entries.values()].map(async (entry) => [
        entry.name,
        await entry.resource,
      ] as const),
    );
    return ContainerResources.fromNamed(resources);
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

  private startInstance(
    instance: ContainerRuntimeInstance,
    network: ContainerNetwork,
  ): Promise<ContainerResource> {
    const existing = this.entries.get(instance.name);
    if (existing !== undefined) {
      return existing.resource;
    }

    const container = this.registry.createInstance(instance.name, instance.kind) as Container<ContainerResource>;
    const label = instance.name === instance.kind
      ? instance.kind
      : `${instance.name} (${instance.kind})`;
    this.logger.info('runtime', `starting ${label} container`);
    const resource = container
      .start({ network, networkAliases: [instance.name], logger: this.logger })
      .then((startedResource) => {
        this.startedOrder.push(instance.name);
        this.logger.info('runtime', `${label} container is ready`);
        return startedResource;
      })
      .catch((error: unknown) => {
        this.logger.error('runtime', `${label} container failed to start`, error);
        throw error;
      });
    this.entries.set(instance.name, {
      name: instance.name,
      kind: instance.kind,
      container,
      resource,
    });
    return resource;
  }

  private async stopAll(): Promise<void> {
    const failures: unknown[] = [];
    const pendingNames = [...this.entries.keys()].filter(
      (name) => !this.startedOrder.includes(name),
    );
    const order = [...this.startedOrder, ...pendingNames].reverse();

    for (const name of order) {
      const entry = this.entries.get(name);
      if (entry === undefined) {
        continue;
      }
      try {
        const label = entry.name === entry.kind
          ? entry.kind
          : `${entry.name} (${entry.kind})`;
        this.logger.info('runtime', `stopping ${label} container`);
        await entry.container.stop();
        this.logger.info('runtime', `${label} container stopped`);
      } catch (error) {
        const label = entry.name === entry.kind
          ? entry.kind
          : `${entry.name} (${entry.kind})`;
        this.logger.error('runtime', `${label} container failed to stop`, error);
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
