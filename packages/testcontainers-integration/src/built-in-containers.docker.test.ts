import { Client } from 'pg';
import { expect, test } from 'vitest';
import { Container } from './container-kind.js';
import { resolveContainerProjectEnvironment } from './container-environment.js';
import {
  containerProjectInstances,
  createContainerProjectRegistry,
  fromContainer,
  postgreSql,
  serializeContainerProject,
} from './container-project.js';
import { ContainerRuntime } from './container-runtime.js';
import { createDefaultContainerRegistry } from './default-container-registry.js';

const dockerTest = process.env.RUN_DOCKER_TESTS === 'true' ? test : test.skip;
const liveContainerTestTimeout = 360_000;

const registry = () =>
  createDefaultContainerRegistry({
    ...(process.env.MONGO_TEST_IMAGE === undefined
      ? {}
      : { mongoDb: { image: process.env.MONGO_TEST_IMAGE } }),
    ...(process.env.RABBITMQ_TEST_IMAGE === undefined
      ? {}
      : { rabbitMq: { image: process.env.RABBITMQ_TEST_IMAGE } }),
  });

dockerTest(
  'given the SQL Server adapter, when a live runtime starts, then a dynamically mapped endpoint is returned',
  async () => {
    const runtime = new ContainerRuntime(registry());
    try {
      const resource = (await runtime.start([Container.SqlServer])).get(Container.SqlServer);
      expect(resource.host).not.toHaveLength(0);
      expect(resource.port).toBeGreaterThan(0);
    } finally {
      await runtime.stop();
    }
  },
  liveContainerTestTimeout,
);

dockerTest(
  'given the PostgreSQL adapter, when a live runtime starts, then a dynamically mapped endpoint is returned',
  async () => {
    const runtime = new ContainerRuntime(registry());
    try {
      const resource = (await runtime.start([Container.PostgreSql])).get(Container.PostgreSql);
      expect(resource.connectionUri).toContain(`:${resource.port}/`);
    } finally {
      await runtime.stop();
    }
  },
  liveContainerTestTimeout,
);

dockerTest(
  'given two named PostgreSQL declarations, when both mapped URLs are used, then each database stores independent data',
  async () => {
    const project = serializeContainerProject(
      {
        primaryDatabase: postgreSql({ database: 'primary_app' }),
        auditDatabase: postgreSql({ database: 'audit_app' }),
      },
      {
        DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
        AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
      },
    );
    const runtime = new ContainerRuntime(createContainerProjectRegistry(project));
    let primary: Client | undefined;
    let audit: Client | undefined;
    try {
      const resources = await runtime.startInstances(containerProjectInstances(project));
      const environment = resolveContainerProjectEnvironment(project, resources);
      primary = new Client({ connectionString: environment.DATABASE_URL });
      audit = new Client({ connectionString: environment.AUDIT_DATABASE_URL });
      await Promise.all([primary.connect(), audit.connect()]);
      await Promise.all([
        primary.query('CREATE TABLE verification (value TEXT NOT NULL)'),
        audit.query('CREATE TABLE verification (value TEXT NOT NULL)'),
      ]);
      await Promise.all([
        primary.query('INSERT INTO verification (value) VALUES ($1)', ['primary']),
        audit.query('INSERT INTO verification (value) VALUES ($1)', ['audit']),
      ]);

      const [primaryResult, auditResult] = await Promise.all([
        primary.query<{ value: string }>('SELECT value FROM verification'),
        audit.query<{ value: string }>('SELECT value FROM verification'),
      ]);
      expect(primaryResult.rows).toEqual([{ value: 'primary' }]);
      expect(auditResult.rows).toEqual([{ value: 'audit' }]);
      expect(
        resources.getNamed('primaryDatabase', Container.PostgreSql).port,
      ).not.toBe(resources.getNamed('auditDatabase', Container.PostgreSql).port);
    } finally {
      await Promise.allSettled([
        ...(primary === undefined ? [] : [primary.end()]),
        ...(audit === undefined ? [] : [audit.end()]),
      ]);
      await runtime.stop();
    }
  },
  liveContainerTestTimeout,
);

dockerTest(
  'given the MongoDB adapter, when a live runtime starts, then a dynamically mapped endpoint is returned',
  async () => {
    const runtime = new ContainerRuntime(registry());
    try {
      const resource = (await runtime.start([Container.MongoDb])).get(Container.MongoDb);
      expect(resource.connectionString).toContain(String(resource.port));
    } finally {
      await runtime.stop();
    }
  },
  liveContainerTestTimeout,
);

dockerTest(
  'given the RabbitMQ adapter, when a live runtime starts, then a dynamically mapped endpoint is returned',
  async () => {
    const runtime = new ContainerRuntime(registry());
    try {
      const resource = (await runtime.start([Container.RabbitMq])).get(Container.RabbitMq);
      expect(resource.amqpUrl).toContain(String(resource.port));
    } finally {
      await runtime.stop();
    }
  },
  liveContainerTestTimeout,
);
