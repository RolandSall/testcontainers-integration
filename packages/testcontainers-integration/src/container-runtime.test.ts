import { describe, expect, test } from 'vitest';
import { Container, type Container as ManagedContainer } from './container-kind.js';
import { ContainerRegistry } from './container-registry.js';
import { ContainerRuntime } from './container-runtime.js';
import type { ContainerStartOptions } from './container-start-options.js';
import type { ContainerNetwork } from './network/container-network.js';
import type { IntegrationTestLogger } from './logging/integration-test-logger.js';
import { RequiredContainer, requiredContainersFor } from './required-container.js';

interface PostgresResource {
  readonly kind: 'postgres';
  readonly port: number;
}

declare module './container-resource-map.js' {
  interface ContainerResourceMap {
    readonly postgres: PostgresResource;
  }
}

class FakePostgresContainer implements ManagedContainer<PostgresResource> {
  readonly kind = 'postgres';
  startCount = 0;
  stopCount = 0;
  startOptions: ContainerStartOptions | undefined;

  constructor(private readonly events: string[]) {}

  start(options?: ContainerStartOptions): Promise<PostgresResource> {
    this.startCount += 1;
    this.startOptions = options;
    this.events.push('container started');
    return Promise.resolve({ kind: 'postgres', port: 54_321 });
  }

  stop(): Promise<void> {
    this.stopCount += 1;
    this.events.push('container stopped');
    return Promise.resolve();
  }
}

class FakeContainerNetwork implements ContainerNetwork {
  readonly native = {};
  stopCount = 0;

  constructor(private readonly events: string[]) {}

  stop(): Promise<void> {
    this.stopCount += 1;
    this.events.push('network stopped');
    return Promise.resolve();
  }
}

class RecordingLogger implements IntegrationTestLogger {
  readonly entries: string[] = [];

  info(scope: string, message: string): void {
    this.entries.push(`${scope}: ${message}`);
  }

  error(scope: string, message: string, error?: unknown): void {
    this.entries.push(`${scope}: ${message}: ${String(error)}`);
  }
}

describe('ContainerRuntime', () => {
  test(
    'given two named instances of one kind, when the runtime starts, then both resources have independent lifecycles',
    async () => {
      const events: string[] = [];
      const primary = new FakePostgresContainer(events);
      const audit = new FakePostgresContainer(events);
      const network = new FakeContainerNetwork(events);
      const registry = new ContainerRegistry()
        .registerInstance('primaryDatabase', 'postgres', () => primary)
        .registerInstance('auditDatabase', 'postgres', () => audit);
      const runtime = new ContainerRuntime(registry, {
        networkFactory: () => Promise.resolve(network),
      });

      const resources = await runtime.startInstances([
        { name: 'primaryDatabase', kind: 'postgres' },
        { name: 'auditDatabase', kind: 'postgres' },
      ]);

      expect(resources.getNamed('primaryDatabase', 'postgres').port).toBe(54_321);
      expect(resources.getNamed('auditDatabase', 'postgres').port).toBe(54_321);
      expect(() => resources.get('postgres')).toThrow(
        'Multiple postgres resources are available; use resources.getNamed(name, kind)',
      );
      expect(primary.startOptions?.networkAliases).toEqual(['primaryDatabase']);
      expect(audit.startOptions?.networkAliases).toEqual(['auditDatabase']);

      await runtime.stop();
      expect(primary.stopCount).toBe(1);
      expect(audit.stopCount).toBe(1);
      expect(network.stopCount).toBe(1);
    },
  );

  test(
    'given concurrent requirements, when the runtime starts and stops, then one container and network own the lifecycle',
    async () => {
      const events: string[] = [];
      const container = new FakePostgresContainer(events);
      const network = new FakeContainerNetwork(events);
      let factoryCount = 0;
      let networkFactoryCount = 0;
      const logger = new RecordingLogger();
      const registry = new ContainerRegistry().register('postgres', () => {
        factoryCount += 1;
        return container;
      });
      const runtime = new ContainerRuntime(registry, {
        networkFactory: () => {
          networkFactoryCount += 1;
          events.push('network started');
          return Promise.resolve(network);
        },
        logger,
        containerLogs: true,
      });

      const [first, second] = await Promise.all([
        runtime.start(['postgres']),
        runtime.start(['postgres']),
      ]);
      await Promise.all([runtime.stop(), runtime.stop()]);

      expect(first.get('postgres')).toEqual({ kind: 'postgres', port: 54_321 });
      expect(second.get('postgres')).toEqual({ kind: 'postgres', port: 54_321 });
      expect(factoryCount).toBe(1);
      expect(networkFactoryCount).toBe(1);
      expect(container.startCount).toBe(1);
      expect(container.stopCount).toBe(1);
      expect(container.startOptions).toEqual({
        network,
        networkAliases: ['postgres'],
        logger,
        containerLogs: true,
      });
      expect(network.stopCount).toBe(1);
      expect(events).toEqual([
        'network started',
        'container started',
        'container stopped',
        'network stopped',
      ]);
      expect(logger.entries).toEqual([
        'runtime: creating shared container network',
        'runtime: shared container network is ready',
        'runtime: starting postgres container',
        'runtime: postgres container is ready',
        'runtime: stopping postgres container',
        'runtime: postgres container stopped',
        'runtime: stopping shared container network',
        'runtime: shared container network stopped',
      ]);
    },
  );

  test(
    'given startup and cleanup fail, when the runtime starts, then the original failure and every cleanup failure are reported',
    async () => {
      const startupFailure = new Error('container could not start');
      const containerCleanupFailure = new Error('container could not stop');
      const networkCleanupFailure = new Error('network could not stop');
      const container: ManagedContainer<PostgresResource> = {
        kind: 'postgres',
        start: () => Promise.reject(startupFailure),
        stop: () => Promise.reject(containerCleanupFailure),
      };
      const network: ContainerNetwork = {
        native: {},
        stop: () => Promise.reject(networkCleanupFailure),
      };
      const runtime = new ContainerRuntime(
        new ContainerRegistry().register('postgres', () => container),
        { networkFactory: () => Promise.resolve(network) },
      );

      let thrown: unknown;
      try {
        await runtime.start(['postgres']);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AggregateError);
      if (!(thrown instanceof AggregateError)) {
        throw new Error('Expected an aggregate lifecycle failure');
      }
      expect(thrown.message).toBe(
        'Container startup failed and cleanup also failed',
      );
      expect(thrown.cause).toBe(startupFailure);
      expect(thrown.errors).toEqual([
        startupFailure,
        containerCleanupFailure,
        networkCleanupFailure,
      ]);
    },
  );
});

describe('RequiredContainer', () => {
  test(
    'given repeated container declarations, when requirements are read, then unique containers retain declaration order',
    () => {
      @RequiredContainer([Container.SqlServer, 'postgres', Container.SqlServer])
      class MultipleContainerIntegrationTest {}

      expect(requiredContainersFor(MultipleContainerIntegrationTest)).toEqual([
        Container.SqlServer,
        'postgres',
      ]);
    },
  );

  test(
    'given stacked legacy decorators, when requirements are read, then their containers are merged',
    () => {
      @RequiredContainer(Container.SqlServer)
      @RequiredContainer('postgres')
      class StackedContainerIntegrationTest {}

      expect(requiredContainersFor(StackedContainerIntegrationTest)).toEqual([
        'postgres',
        Container.SqlServer,
      ]);
    },
  );
});
