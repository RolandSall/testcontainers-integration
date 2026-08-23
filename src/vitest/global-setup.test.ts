import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Container as ManagedContainer } from '../container-kind.js';
import { Container } from '../container-kind.js';
import { ContainerRegistry } from '../container-registry.js';
import type { ContainerNetwork } from '../network/container-network.js';
import type { SqlServerResource } from '../sql-server/sql-server-resource.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
import { createVitestContainerGlobalSetup } from './global-setup.js';

class FakeSqlServerContainer implements ManagedContainer<SqlServerResource> {
  readonly kind = Container.SqlServer;
  startCount = 0;
  stopCount = 0;

  start(): Promise<SqlServerResource> {
    this.startCount += 1;
    return Promise.resolve({
      kind: Container.SqlServer,
      host: '127.0.0.1',
      port: 14_333,
      username: 'sa',
      password: 'Container!Sql2026',
      database: 'master',
    });
  }

  stop(): Promise<void> {
    this.stopCount += 1;
    return Promise.resolve();
  }
}

class FakeContainerNetwork implements ContainerNetwork {
  readonly native = {};
  stopCount = 0;

  stop(): Promise<void> {
    this.stopCount += 1;
    return Promise.resolve();
  }
}

test(
  'given decorated test files, when Vitest global setup runs, then one container resource is provided and stopped once',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'container-global-setup-'));
    const container = new FakeSqlServerContainer();
    const network = new FakeContainerNetwork();
    let providedKey: string | undefined;
    let providedValue: unknown;
    try {
      await writeFile(
        join(root, 'candidate.container.integration.test.ts'),
        '@RequiredContainer(Container.SqlServer) class CandidateIntegrationTest {}',
      );
      const lifecycle = createVitestContainerGlobalSetup({
        root,
        registry: new ContainerRegistry().register(
          Container.SqlServer,
          () => container,
        ),
        networkFactory: () => Promise.resolve(network),
      });

      await lifecycle.setup({
        provide: (key, value) => {
          providedKey = key;
          providedValue = value;
        },
      });
      await Promise.all([lifecycle.teardown(), lifecycle.teardown()]);

      expect(providedKey).toBe(CONTAINER_RESOURCES_CONTEXT_KEY);
      expect(providedValue).toEqual({
        [Container.SqlServer]: {
          kind: Container.SqlServer,
          host: '127.0.0.1',
          port: 14_333,
          username: 'sa',
          password: 'Container!Sql2026',
          database: 'master',
        },
      });
      expect(container.startCount).toBe(1);
      expect(container.stopCount).toBe(1);
      expect(network.stopCount).toBe(1);
    } finally {
      await rm(root, { recursive: true });
    }
  },
);
