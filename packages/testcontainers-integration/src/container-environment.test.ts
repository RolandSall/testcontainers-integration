import { expect, test } from 'vitest';
import { Container } from './container-kind.js';
import {
  installProcessEnvironment,
  resolveContainerProjectEnvironment,
} from './container-environment.js';
import { fromContainer, serializeContainerProject, postgreSql } from './container-project.js';
import { ContainerResources } from './container-resources.js';
import type { PostgreSqlResource } from './postgresql/postgresql-resource.js';

test('given two PostgreSQL instances, when environment is resolved, then each variable uses its named mapped resource', () => {
  const containers = {
    primary: postgreSql(),
    audit: postgreSql(),
  };
  const project = serializeContainerProject(containers, {
    DATABASE_URL: fromContainer('primary', 'connectionUri'),
    AUDIT_DATABASE_PORT: fromContainer('audit', 'port'),
  });
  const primary: PostgreSqlResource = {
      kind: Container.PostgreSql,
      host: '127.0.0.1',
      port: 54_321,
      database: 'app',
      username: 'test',
      password: 'secret',
      connectionUri: 'postgresql://primary/app',
  };
  const audit: PostgreSqlResource = {
      kind: Container.PostgreSql,
      host: '127.0.0.1',
      port: 54_322,
      database: 'audit',
      username: 'test',
      password: 'secret',
      connectionUri: 'postgresql://audit/audit',
  };
  const resources = ContainerResources.fromNamed([
    ['primary', primary],
    ['audit', audit],
  ]);

  expect(resolveContainerProjectEnvironment(project, resources)).toEqual({
    DATABASE_URL: 'postgresql://primary/app',
    AUDIT_DATABASE_PORT: '54322',
  });
  expect(() => resources.get(Container.PostgreSql)).toThrow(
    'Multiple postgresql resources are available; use resources.getNamed(name, kind)',
  );
  expect(resources.getNamed('audit', Container.PostgreSql).database).toBe('audit');
});

test('given existing process values, when installed values are restored twice, then the original environment is retained', () => {
  const existingName = 'CONTAINER_INTEGRATION_EXISTING_TEST';
  const newName = 'CONTAINER_INTEGRATION_NEW_TEST';
  process.env[existingName] = 'original';
  delete process.env[newName];
  const restore = installProcessEnvironment({
    [existingName]: 'mapped',
    [newName]: 'new',
  });

  expect(process.env[existingName]).toBe('mapped');
  expect(process.env[newName]).toBe('new');
  restore();
  restore();
  expect(process.env[existingName]).toBe('original');
  expect(process.env[newName]).toBeUndefined();
  delete process.env[existingName];
});
