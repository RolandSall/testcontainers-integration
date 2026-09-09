import { expect, test } from 'vitest';
import { Container } from './container-kind.js';
import {
  containerProjectKinds,
  createContainerProjectRegistry,
  fromContainer,
  parseContainerProject,
  postgreSql,
  rabbitMq,
  serializeContainerProject,
} from './container-project.js';

test('given named built-ins, when a project is serialized, then names, options, and kinds remain explicit', () => {
  const project = serializeContainerProject({
    database: postgreSql({ isolation: 'dedicated', database: 'orders' }),
    messages: rabbitMq({ isolation: 'shared', startupTimeoutMs: 45_000 }),
  });

  expect(project).toEqual({
    version: 2,
    containers: [
      { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated', options: { database: 'orders' } },
      { name: 'messages', kind: Container.RabbitMq, isolation: 'shared', options: { startupTimeoutMs: 45_000 } },
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
    primary: postgreSql({ isolation: 'dedicated' }),
    replica: postgreSql({ isolation: 'dedicated', database: 'reporting' }),
  };
  const project = serializeContainerProject(containers, {
    DATABASE_URL: fromContainer('primary', 'connectionUri'),
    REPORTING_DATABASE_URL: fromContainer('replica', 'connectionUri'),
  });

  expect(project).toEqual({
    version: 2,
    containers: [
      { name: 'primary', kind: Container.PostgreSql, isolation: 'dedicated', options: {} },
      { name: 'replica', kind: Container.PostgreSql, isolation: 'dedicated', options: { database: 'reporting' } },
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
    { database: postgreSql({ isolation: 'shared' }) },
    {
      DATABASE_URL: fromContainer('missing', 'connectionUri'),
    } as never,
  )).toThrow('Container project environment references an unknown container: missing');
});

test('given a transported container without isolation, when parsed, then it fails actionably', () => {
  expect(() => parseContainerProject({
    version: 2,
    containers: [{ name: 'database', kind: Container.PostgreSql, options: {} }],
  })).toThrow(
    'Container project isolation is invalid: database',
  );
});

test('given duplicate transported names, when parsed, then the conflicting name is reported', () => {
  expect(() => parseContainerProject({
    version: 2,
    containers: [
      { name: 'database', kind: Container.PostgreSql, isolation: 'shared', options: {} },
      { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated', options: {} },
    ],
  })).toThrow('Container project name is duplicated: database');
});

test('given an invalid transported isolation, when parsed, then the container name is reported', () => {
  expect(() => parseContainerProject({
    version: 2,
    containers: [
      { name: 'database', kind: Container.PostgreSql, isolation: 'worker', options: {} },
    ],
  })).toThrow('Container project isolation is invalid: database');
});
