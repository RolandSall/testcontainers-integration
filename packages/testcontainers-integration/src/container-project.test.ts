import { expect, test } from 'vitest';
import { Container } from './container-kind.js';
import {
  containerProjectKinds,
  createContainerProjectRegistry,
  fromContainer,
  postgreSql,
  rabbitMq,
  serializeContainerProject,
} from './container-project.js';

test('given named built-ins, when a project is serialized, then names, options, and kinds remain explicit', () => {
  const project = serializeContainerProject({
    database: postgreSql({ database: 'orders' }),
    messages: rabbitMq({ startupTimeoutMs: 45_000 }),
  });

  expect(project).toEqual({
    version: 1,
    containers: [
      { name: 'database', kind: Container.PostgreSql, options: { database: 'orders' } },
      { name: 'messages', kind: Container.RabbitMq, options: { startupTimeoutMs: 45_000 } },
    ],
  });
  expect(containerProjectKinds(project)).toEqual([
    Container.PostgreSql,
    Container.RabbitMq,
  ]);
  const registry = createContainerProjectRegistry(project);
  expect(registry.create(Container.PostgreSql).kind).toBe(Container.PostgreSql);
  expect(registry.create(Container.RabbitMq).kind).toBe(Container.RabbitMq);
});

test('given two names for one built-in kind, when serialized, then both configured instances remain addressable', () => {
  const containers = {
    primary: postgreSql(),
    replica: postgreSql({ database: 'reporting' }),
  };
  const project = serializeContainerProject(containers, {
    DATABASE_URL: fromContainer('primary', 'connectionUri'),
    REPORTING_DATABASE_URL: fromContainer('replica', 'connectionUri'),
  });

  expect(project).toEqual({
    version: 1,
    containers: [
      { name: 'primary', kind: Container.PostgreSql, options: {} },
      { name: 'replica', kind: Container.PostgreSql, options: { database: 'reporting' } },
    ],
    environment: {
      DATABASE_URL: {
        source: 'container',
        container: 'primary',
        property: 'connectionUri',
      },
      REPORTING_DATABASE_URL: {
        source: 'container',
        container: 'replica',
        property: 'connectionUri',
      },
    },
  });
});

test('given an unknown environment source, when serialized, then configuration fails before containers start', () => {
  expect(() => serializeContainerProject(
    { database: postgreSql() },
    {
      DATABASE_URL: fromContainer('missing', 'connectionUri'),
    } as never,
  )).toThrow('Container project environment references an unknown container: missing');
});
