import { expect, test } from 'vitest';
import type { Container as ManagedContainer } from './container-kind.js';
import { Container } from './container-kind.js';
import { fromContainer } from './container-project.js';
import { ContainerRegistry } from './container-registry.js';
import { ContainerResources } from './container-resources.js';
import type { ContainerNetwork } from './network/container-network.js';
import type { PostgreSqlResource } from './postgresql/postgresql-resource.js';
import type { RabbitMqResource } from './rabbit-mq/rabbit-mq-resource.js';
import { IntegrationTestFileController } from './integration-test-file-controller.js';

const databaseUrlName = 'FILE_CONTROLLER_DATABASE_URL';
const rabbitUrlName = 'FILE_CONTROLLER_RABBITMQ_URL';

test('installs mapped environment before application startup and restores it before dedicated cleanup', async () => {
  const events: string[] = [];
  const database = new FakeDatabase(events);
  const network = new FakeNetwork(events);
  const controller = new IntegrationTestFileController();
  process.env[databaseUrlName] = 'original';
  delete process.env[rabbitUrlName];
  controller.configureApplication({
    start: (resources) => {
      events.push('application started');
      expect(process.env[databaseUrlName]).toBe('postgresql://127.0.0.1:54321/app');
      expect(process.env[rabbitUrlName]).toBe('amqp://127.0.0.1:5672');
      expect(resources.getNamed('database', Container.PostgreSql).port).toBe(54_321);
      return Promise.resolve({ listening: true });
    },
    stop: () => {
      events.push(`application stopped with ${String(process.env[databaseUrlName])}`);
      return Promise.resolve();
    },
  });

  try {
    await controller.start({
      declarations: [
        { name: 'messages', kind: Container.RabbitMq, isolation: 'shared' },
        { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated' },
      ],
      sharedResources: sharedRabbitMq(),
      registry: new ContainerRegistry().registerInstance(
        'database', Container.PostgreSql, () => database,
      ),
      runtimeOptions: { networkFactory: () => Promise.resolve(network) },
      environment: {
        [databaseUrlName]: fromContainer('database', 'connectionUri'),
        [rabbitUrlName]: fromContainer('messages', 'amqpUrl'),
      },
      startApplication: true,
    });

    expect(controller.currentApplication()).toEqual({ listening: true });
    await controller.stop();

    expect(process.env[databaseUrlName]).toBe('original');
    expect(process.env[rabbitUrlName]).toBeUndefined();
    expect(events).toEqual([
      'application started',
      'application stopped with postgresql://127.0.0.1:54321/app',
      'database stopped after original',
      'network stopped',
    ]);
  } finally {
    await controller.stop();
    delete process.env[databaseUrlName];
    delete process.env[rabbitUrlName];
  }
});

test('application bootstrap rejection immediately restores environment and cleans file-owned infrastructure', async () => {
  const events: string[] = [];
  const bootstrapFailure = new Error('Nest application bootstrap failed');
  const database = new FakeDatabase(events);
  const network = new FakeNetwork(events);
  const controller = new IntegrationTestFileController();
  process.env[databaseUrlName] = 'original';
  let stopCount = 0;
  controller.configureApplication({
    start: () => {
      events.push(`bootstrap failed with ${String(process.env[databaseUrlName])}`);
      return Promise.reject(bootstrapFailure);
    },
    stop: () => {
      stopCount += 1;
      return Promise.resolve();
    },
  });

  try {
    await expect(controller.start({
      declarations: [
        { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated' },
      ],
      sharedResources: new ContainerResources([]),
      registry: new ContainerRegistry().registerInstance(
        'database', Container.PostgreSql, () => database,
      ),
      runtimeOptions: { networkFactory: () => Promise.resolve(network) },
      environment: {
        [databaseUrlName]: fromContainer('database', 'connectionUri'),
      },
      startApplication: true,
    })).rejects.toBe(bootstrapFailure);

    expect(stopCount).toBe(0);
    expect(process.env[databaseUrlName]).toBe('original');
    expect(database.stopCount).toBe(1);
    expect(network.stopCount).toBe(1);
    expect(events).toEqual([
      'bootstrap failed with postgresql://127.0.0.1:54321/app',
      'database stopped after original',
      'network stopped',
    ]);
  } finally {
    await controller.stop();
    delete process.env[databaseUrlName];
  }
});

test('an invalid environment binding fails before application startup and cleans file resources', async () => {
  const database = new FakeDatabase([]);
  const network = new FakeNetwork([]);
  const controller = new IntegrationTestFileController();
  let applicationStartCount = 0;
  controller.configureApplication({
    start: () => {
      applicationStartCount += 1;
      return Promise.resolve({ listening: true });
    },
    stop: () => Promise.resolve(),
  });

  await expect(controller.start({
    declarations: [
      { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated' },
    ],
    sharedResources: new ContainerResources([]),
    registry: new ContainerRegistry().registerInstance(
      'database', Container.PostgreSql, () => database,
    ),
    runtimeOptions: { networkFactory: () => Promise.resolve(network) },
    environment: {
      [databaseUrlName]: fromContainer('missingDatabase', 'connectionUri'),
    },
    startApplication: true,
  })).rejects.toThrow('references an unknown container: missingDatabase');

  expect(applicationStartCount).toBe(0);
  expect(database.stopCount).toBe(1);
  expect(network.stopCount).toBe(1);
});

test('an application stop failure does not skip environment, container, or network cleanup', async () => {
  const stopFailure = new Error('application stop failed');
  const database = new FakeDatabase([]);
  const network = new FakeNetwork([]);
  const controller = new IntegrationTestFileController();
  process.env[databaseUrlName] = 'original';
  controller.configureApplication({
    start: () => Promise.resolve({ listening: true }),
    stop: () => Promise.reject(stopFailure),
  });
  try {
    await controller.start({
      declarations: [
        { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated' },
      ],
      sharedResources: new ContainerResources([]),
      registry: new ContainerRegistry().registerInstance(
        'database', Container.PostgreSql, () => database,
      ),
      runtimeOptions: { networkFactory: () => Promise.resolve(network) },
      environment: {
        [databaseUrlName]: fromContainer('database', 'connectionUri'),
      },
      startApplication: true,
    });

    await expect(controller.stop()).rejects.toMatchObject({
      errors: [stopFailure],
    });
    expect(process.env[databaseUrlName]).toBe('original');
    expect(database.stopCount).toBe(1);
    expect(network.stopCount).toBe(1);
  } finally {
    await controller.stop();
    delete process.env[databaseUrlName];
  }
});

class FakeDatabase implements ManagedContainer<PostgreSqlResource> {
  readonly kind = Container.PostgreSql;
  stopCount = 0;

  constructor(private readonly events: string[]) {}

  start(): Promise<PostgreSqlResource> {
    return Promise.resolve({
      kind: Container.PostgreSql,
      host: '127.0.0.1',
      port: 54_321,
      database: 'app',
      username: 'test',
      password: 'secret',
      connectionUri: 'postgresql://127.0.0.1:54321/app',
    });
  }

  stop(): Promise<void> {
    this.stopCount += 1;
    this.events.push(`database stopped after ${String(process.env[databaseUrlName])}`);
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
