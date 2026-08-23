import { access, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Container as ManagedContainer } from '../container-kind.js';
import { Container } from '../container-kind.js';
import { ContainerRegistry } from '../container-registry.js';
import type { ContainerStartOptions } from '../container-start-options.js';
import type { ContainerNetwork } from '../network/container-network.js';
import type { SqlServerResource } from '../sql-server/sql-server-resource.js';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from './context-key.js';
import { createJestContainerGlobalSetup } from './global-setup.js';
import { injectedContainerResources } from './injected-resources.js';

class FakeSqlServerContainer implements ManagedContainer<SqlServerResource> {
  readonly kind = Container.SqlServer;
  startCount = 0;
  stopCount = 0;
  startOptions: ContainerStartOptions | undefined;

  start(options?: ContainerStartOptions): Promise<SqlServerResource> {
    this.startCount += 1;
    this.startOptions = options;
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
  'given multiple Jest workers need one container, when global lifecycle runs repeatedly, then one protected resource document and runtime are shared',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'jest-container-global-setup-'));
    const container = new FakeSqlServerContainer();
    const network = new FakeContainerNetwork();
    const lifecycle = createJestContainerGlobalSetup({
      root,
      registry: new ContainerRegistry().register(
        Container.SqlServer,
        () => container,
      ),
      networkFactory: () => Promise.resolve(network),
    });
    try {
      await writeFile(
        join(root, 'candidate.container.integration.test.ts'),
        '@RequiredContainer(Container.SqlServer) class CandidateApiIntegrationTest {}',
      );

      await lifecycle.setup();
      await lifecycle.setup();

      const resourcePath = process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
      expect(resourcePath).toBeDefined();
      if (resourcePath === undefined) {
        throw new Error('Expected Jest resource path');
      }
      expect((await stat(resourcePath)).mode & 0o777).toBe(0o600);
      expect(injectedContainerResources().get(Container.SqlServer)).toEqual({
        kind: Container.SqlServer,
        host: '127.0.0.1',
        port: 14_333,
        username: 'sa',
        password: 'Container!Sql2026',
        database: 'master',
      });
      expect(container.startCount).toBe(1);
      expect(container.startOptions?.network).toBe(network);

      await lifecycle.teardown();
      await lifecycle.teardown();

      expect(container.stopCount).toBe(1);
      expect(network.stopCount).toBe(1);
      expect(process.env[JEST_CONTAINER_RESOURCES_PATH_ENV]).toBeUndefined();
      await expect(access(resourcePath)).rejects.toThrow();
    } finally {
      await lifecycle.teardown();
      delete process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
      await rm(root, { recursive: true, force: true });
    }
  },
);
