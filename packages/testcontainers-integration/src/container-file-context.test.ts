import { expect, test } from 'vitest';
import type { Container as ManagedContainer } from './container-kind.js';
import { Container } from './container-kind.js';
import { ContainerFileContext } from './container-file-context.js';
import { ContainerRegistry } from './container-registry.js';
import { ContainerResources } from './container-resources.js';
import type { ContainerStartOptions } from './container-start-options.js';
import type { ContainerNetwork } from './network/container-network.js';
import type { PostgreSqlResource } from './postgresql/postgresql-resource.js';
import type { RabbitMqResource } from './rabbit-mq/rabbit-mq-resource.js';
import type { RequiredContainerInstance } from './required-container.js';

const declarations: readonly RequiredContainerInstance[] = [
  { name: 'messages', kind: Container.RabbitMq, isolation: 'shared' },
  { name: 'primaryDatabase', kind: Container.PostgreSql, isolation: 'dedicated' },
  { name: 'auditDatabase', kind: Container.PostgreSql, isolation: 'dedicated' },
];

test('merges one shared resource with two file-dedicated resources on one private network', async () => {
  const events: string[] = [];
  const network = new FakeNetwork(events);
  const primary = new FakePostgresContainer(54_321, events);
  const audit = new FakePostgresContainer(54_322, events);
  const registry = new ContainerRegistry()
    .registerInstance('primaryDatabase', Container.PostgreSql, () => primary)
    .registerInstance('auditDatabase', Container.PostgreSql, () => audit);
  const context = new ContainerFileContext(registry, {
    networkFactory: () => Promise.resolve(network),
  });
  let preparationCleanupCount = 0;

  const resources = await context.start(
    declarations,
    sharedRabbitMq(),
    (prepared) => {
      expect(prepared.getNamed('messages', Container.RabbitMq).port).toBe(56_72);
      expect(prepared.getNamed('primaryDatabase', Container.PostgreSql).port).toBe(54_321);
      expect(prepared.getNamed('auditDatabase', Container.PostgreSql).port).toBe(54_322);
      return Promise.resolve(() => {
        preparationCleanupCount += 1;
        events.push('preparation stopped');
      });
    },
  );

  expect(resources.kinds()).toEqual([Container.RabbitMq, Container.PostgreSql]);
  expect(primary.startOptions?.network).toBe(network);
  expect(audit.startOptions?.network).toBe(network);
  expect(primary.startOptions?.networkAliases).toEqual(['primaryDatabase']);
  expect(audit.startOptions?.networkAliases).toEqual(['auditDatabase']);

  await Promise.all([context.stop(), context.stop()]);

  expect(primary.stopCount).toBe(1);
  expect(audit.stopCount).toBe(1);
  expect(network.stopCount).toBe(1);
  expect(preparationCleanupCount).toBe(1);
  expect(events.indexOf('preparation stopped')).toBeLessThan(events.indexOf('auditDatabase stopped'));
});

test('two file contexts receive distinct dedicated containers from file lifecycle identity', async () => {
  let nextPort = 55_000;
  let networkCount = 0;
  const registry = new ContainerRegistry()
    .registerInstance(
      'primaryDatabase',
      Container.PostgreSql,
      () => new FakePostgresContainer(nextPort++, []),
    )
    .registerInstance(
      'auditDatabase',
      Container.PostgreSql,
      () => new FakePostgresContainer(nextPort++, []),
    );
  const createContext = () => new ContainerFileContext(registry, {
    networkFactory: () => {
      networkCount += 1;
      return Promise.resolve(new FakeNetwork([]));
    },
  });
  const first = createContext();
  const second = createContext();
  try {
    const [firstResources, secondResources] = await Promise.all([
      first.start(declarations, sharedRabbitMq()),
      second.start(declarations, sharedRabbitMq()),
    ]);

    expect(firstResources.getNamed('messages', Container.RabbitMq).port).toBe(
      secondResources.getNamed('messages', Container.RabbitMq).port,
    );
    expect(firstResources.getNamed('primaryDatabase', Container.PostgreSql).port).not.toBe(
      secondResources.getNamed('primaryDatabase', Container.PostgreSql).port,
    );
    expect(firstResources.getNamed('auditDatabase', Container.PostgreSql).port).not.toBe(
      secondResources.getNamed('auditDatabase', Container.PostgreSql).port,
    );
    expect(networkCount).toBe(2);
  } finally {
    await Promise.all([first.stop(), second.stop()]);
  }
});

test('a partial dedicated startup failure cleans every created container and the private network', async () => {
  const startupFailure = new Error('audit database failed');
  const network = new FakeNetwork([]);
  const primary = new FakePostgresContainer(54_321, []);
  const audit = new FakePostgresContainer(54_322, [], startupFailure);
  const context = new ContainerFileContext(
    new ContainerRegistry()
      .registerInstance('primaryDatabase', Container.PostgreSql, () => primary)
      .registerInstance('auditDatabase', Container.PostgreSql, () => audit),
    { networkFactory: () => Promise.resolve(network) },
  );

  await expect(context.start(declarations, sharedRabbitMq())).rejects.toBe(startupFailure);

  expect(primary.stopCount).toBe(1);
  expect(audit.stopCount).toBe(1);
  expect(network.stopCount).toBe(1);
});

test('a preparation failure cleans dedicated containers and the private network', async () => {
  const preparationFailure = new Error('migration failed');
  const network = new FakeNetwork([]);
  const primary = new FakePostgresContainer(54_321, []);
  const audit = new FakePostgresContainer(54_322, []);
  const context = new ContainerFileContext(
    new ContainerRegistry()
      .registerInstance('primaryDatabase', Container.PostgreSql, () => primary)
      .registerInstance('auditDatabase', Container.PostgreSql, () => audit),
    { networkFactory: () => Promise.resolve(network) },
  );

  await expect(context.start(
    declarations,
    sharedRabbitMq(),
    () => Promise.reject(preparationFailure),
  )).rejects.toBe(preparationFailure);

  expect(primary.stopCount).toBe(1);
  expect(audit.stopCount).toBe(1);
  expect(network.stopCount).toBe(1);
});

class FakePostgresContainer implements ManagedContainer<PostgreSqlResource> {
  readonly kind = Container.PostgreSql;
  startOptions: ContainerStartOptions | undefined;
  stopCount = 0;

  constructor(
    private readonly port: number,
    private readonly events: string[],
    private readonly startFailure?: Error,
  ) {}

  start(options?: ContainerStartOptions): Promise<PostgreSqlResource> {
    this.startOptions = options;
    if (this.startFailure !== undefined) return Promise.reject(this.startFailure);
    return Promise.resolve({
      kind: Container.PostgreSql,
      host: '127.0.0.1',
      port: this.port,
      database: 'app',
      username: 'test',
      password: 'secret',
      connectionUri: `postgresql://127.0.0.1:${this.port}/app`,
    });
  }

  stop(): Promise<void> {
    this.stopCount += 1;
    const alias = this.startOptions?.networkAliases?.[0] ?? 'database';
    this.events.push(`${alias} stopped`);
    return Promise.resolve();
  }
}

class FakeNetwork implements ContainerNetwork {
  readonly native = {};
  stopCount = 0;

  constructor(private readonly events: string[]) {}

  stop(): Promise<void> {
    this.stopCount += 1;
    this.events.push('network stopped');
    return Promise.resolve();
  }
}

const sharedRabbitMq = (): ContainerResources => {
  const resource: RabbitMqResource = {
    kind: Container.RabbitMq,
    host: '127.0.0.1',
    port: 56_72,
    amqpUrl: 'amqp://127.0.0.1:5672',
    amqpsUrl: 'amqps://127.0.0.1:5671',
  };
  return ContainerResources.fromNamed([['messages', resource]]);
};
