import { expect, test } from 'vitest';
import { ApplicationIntegrationTest } from '../application-integration-test.js';
import { Container } from '../container-kind.js';
import { ContainerResources } from '../container-resources.js';
import { RequiredContainer } from '../required-container.js';
import type { SqlServerResource } from '../sql-server/sql-server-resource.js';
import { ApplicationIntegrationTestContextManager } from './application-integration-test-context-manager.js';

const sqlServer: SqlServerResource = {
  kind: Container.SqlServer,
  host: '127.0.0.1',
  port: 14_333,
  username: 'sa',
  password: 'Container!Sql2026',
  database: 'master',
};

test(
  'given an annotated application test, when its context starts and stops, then resources and application follow dependency order',
  async () => {
    const events: string[] = [];
    const contextManager = new ApplicationIntegrationTestContextManager({
      start: (resources) => {
        events.push('application started');
        return Promise.resolve({ port: resources.get(Container.SqlServer).port });
      },
      stop: () => {
        events.push('application stopped');
        return Promise.resolve();
      },
    });

    @RequiredContainer({
      database: { kind: Container.SqlServer, isolation: 'shared' },
    })
    @ApplicationIntegrationTest
    class CandidateApiIntegrationTest {}

    await contextManager.start(
      CandidateApiIntegrationTest,
      ContainerResources.fromNamed([['database', sqlServer]]),
    );
    expect(contextManager.current()).toEqual({ port: 14_333 });
    await contextManager.stop();
    await contextManager.stop();

    expect(events).toEqual(['application started', 'application stopped']);
  },
);

test(
  'given an application marker without container requirements, when its context starts, then setup is rejected',
  async () => {
    const contextManager = new ApplicationIntegrationTestContextManager({
      start: () => Promise.resolve({ listening: true }),
      stop: () => Promise.resolve(),
    });

    @ApplicationIntegrationTest
    class CandidateApiIntegrationTest {}

    await expect(
      contextManager.start(CandidateApiIntegrationTest, new ContainerResources([])),
    ).rejects.toThrow(
      '@ApplicationIntegrationTest requires @RequiredContainer(...) on the same class',
    );
  },
);
