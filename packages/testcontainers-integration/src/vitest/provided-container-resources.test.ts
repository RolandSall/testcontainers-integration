import { expect, test } from 'vitest';
import { Container } from '../container-kind.js';
import { restoreProvidedContainerResources } from './provided-container-resources.js';

test(
  'given Vitest global setup was omitted, when worker resources are restored, then the error explains how to configure the test',
  () => {
    expect(() => restoreProvidedContainerResources(undefined)).toThrow(
      'Vitest container resources were not provided. Run this test with the integration Vitest config and register createVitestContainerGlobalSetup(...) in test.globalSetup.',
    );
  },
);

test(
  'given Vitest provides a malformed resource, when worker resources are restored, then the invalid kind is reported',
  () => {
    expect(() =>
      restoreProvidedContainerResources({
        [Container.SqlServer]: { host: '127.0.0.1' },
      }),
    ).toThrow('Invalid Vitest container resource: sql-server');
  },
);

test(
  'given Vitest provides named resources, when two instances share a kind, then named lookup remains available',
  () => {
    const resources = restoreProvidedContainerResources({
      primaryDatabase: {
        kind: Container.PostgreSql,
        connectionUri: 'postgresql://primary/app',
      },
      auditDatabase: {
        kind: Container.PostgreSql,
        connectionUri: 'postgresql://audit/audit',
      },
    });

    expect(
      resources.getNamed('auditDatabase', Container.PostgreSql).connectionUri,
    ).toBe('postgresql://audit/audit');
  },
);

test(
  'given Vitest provides a valid resource document, when worker resources are restored, then typed lookup is available',
  () => {
    const resources = restoreProvidedContainerResources({
      [Container.SqlServer]: {
        kind: Container.SqlServer,
        host: '127.0.0.1',
        port: 14_333,
        username: 'sa',
        password: 'Container!Sql2026',
        database: 'master',
      },
    });

    expect(resources.get(Container.SqlServer).port).toBe(14_333);
  },
);
