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

  runtimeMetadata() {
    return {
      id: 'container-id',
      image: 'postgres:17-alpine',
      mappedPorts: { '5432': 54_321 },
    };
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
  test('emits ordered non-secret lifecycle metadata for a dedicated file runtime', async () => {
    const lifecycleEvents: Record<string, unknown>[] = [];
    const container = new FakePostgresContainer([]);
    const runtime = new ContainerRuntime(
      new ContainerRegistry().registerInstance('database', 'postgres', () => container),
      {
        networkFactory: () => Promise.resolve(new FakeContainerNetwork([])),
        eventSink: { emit: (event) => lifecycleEvents.push({ ...event }) },
        eventContext: { isolation: 'dedicated', filePath: '/test/orders.test.ts' },
      },
    );

    await runtime.startInstances([{ name: 'database', kind: 'postgres' }]);
    await runtime.stop();

    expect(lifecycleEvents.map(({ type }) => type)).toEqual([
      'network.starting',
      'network.ready',
      'container.starting',
      'container.ready',
      'container.stopping',
      'container.stopped',
      'network.stopping',
      'network.stopped',
    ]);
    expect(lifecycleEvents.find(({ type }) => type === 'container.ready')).toMatchObject({
      containerName: 'database',
      containerKind: 'postgres',
      isolation: 'dedicated',
      filePath: '/test/orders.test.ts',
      containerId: 'container-id',
      image: 'postgres:17-alpine',
      mappedPorts: { '5432': 54_321 },
    });
    expect(JSON.stringify(lifecycleEvents)).not.toMatch(/password|connectionUri/iu);
  });

  test('correlates opt-in container output with its named container', async () => {
    const lifecycleEvents: Record<string, unknown>[] = [];
    const container: ManagedContainer<PostgresResource> = {
      kind: 'postgres',
      start: (options) => {
        options?.logger?.info('container:postgres', 'database system is ready');
        return Promise.resolve({ kind: 'postgres', port: 54_321 });
      },
      stop: () => Promise.resolve(),
    };
    const runtime = new ContainerRuntime(
      new ContainerRegistry().registerInstance('primaryDatabase', 'postgres', () => container),
      {
        networkFactory: () => Promise.resolve(new FakeContainerNetwork([])),
        containerLogs: true,
        eventSink: { emit: (event) => lifecycleEvents.push({ ...event }) },
        eventContext: { isolation: 'dedicated', filePath: '/test/orders.test.ts' },
      },
    );

    await runtime.startInstances([{ name: 'primaryDatabase', kind: 'postgres' }]);
    await runtime.stop();

    expect(lifecycleEvents.find(({ type }) => type === 'container.log')).toMatchObject({
      containerName: 'primaryDatabase',
      containerKind: 'postgres',
      isolation: 'dedicated',
      filePath: '/test/orders.test.ts',
      message: 'database system is ready',
    });
  });

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
        'runtime: creating container network',
        'runtime: container network is ready',
        'runtime: starting postgres container',
        'runtime: postgres container is ready',
        'runtime: stopping postgres container',
        'runtime: postgres container stopped',
        'runtime: stopping container network',
        'runtime: container network stopped',
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

  test('one container cleanup failure does not skip the remaining container or network', async () => {
    const cleanupFailure = new Error('audit cleanup failed');
    let primaryStopCount = 0;
    let auditStopCount = 0;
    const network = new FakeContainerNetwork([]);
    const resource: PostgresResource = { kind: 'postgres', port: 54_321 };
    const primary: ManagedContainer<PostgresResource> = {
      kind: 'postgres',
      start: () => Promise.resolve(resource),
      stop: () => {
        primaryStopCount += 1;
        return Promise.resolve();
      },
    };
    const audit: ManagedContainer<PostgresResource> = {
      kind: 'postgres',
      start: () => Promise.resolve(resource),
      stop: () => {
        auditStopCount += 1;
        return Promise.reject(cleanupFailure);
      },
    };
    const runtime = new ContainerRuntime(
      new ContainerRegistry()
        .registerInstance('primary', 'postgres', () => primary)
        .registerInstance('audit', 'postgres', () => audit),
      { networkFactory: () => Promise.resolve(network) },
    );
    await runtime.startInstances([
      { name: 'primary', kind: 'postgres' },
      { name: 'audit', kind: 'postgres' },
    ]);

    await expect(runtime.stop()).rejects.toMatchObject({ errors: [cleanupFailure] });

    expect(primaryStopCount).toBe(1);
    expect(auditStopCount).toBe(1);
    expect(network.stopCount).toBe(1);
  });
});

describe('RequiredContainer', () => {
  test('retains named mixed-isolation declarations', () => {
    @RequiredContainer({
      messages: { kind: Container.RabbitMq, isolation: 'shared' },
      primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
      auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
    })
    class MultipleContainerIntegrationTest {}

    expect(requiredContainersFor(MultipleContainerIntegrationTest)).toEqual([
      { name: 'messages', kind: Container.RabbitMq, isolation: 'shared' },
      { name: 'primaryDatabase', kind: Container.PostgreSql, isolation: 'dedicated' },
      { name: 'auditDatabase', kind: Container.PostgreSql, isolation: 'dedicated' },
    ]);
  });
});
