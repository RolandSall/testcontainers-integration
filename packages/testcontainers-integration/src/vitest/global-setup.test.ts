import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import type { Container as ManagedContainer } from '../container-kind.js';
import { Container } from '../container-kind.js';
import { ContainerRegistry } from '../container-registry.js';
import type { ContainerNetwork } from '../network/container-network.js';
import type { SqlServerResource } from '../sql-server/sql-server-resource.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
import { createVitestContainerGlobalSetup } from './global-setup.js';
import { DashboardSession } from '../dashboard/dashboard-session.js';
import { DASHBOARD_SESSIONS_ENV } from '../dashboard/dashboard-context.js';

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
  'given decorated test files, when Vitest global setup runs, then resources are prepared before they are provided and stopped once',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'container-global-setup-'));
    const container = new FakeSqlServerContainer();
    const network = new FakeContainerNetwork();
    let providedKey: string | undefined;
    let providedValue: unknown;
    const events: string[] = [];
    try {
      await writeFile(
        join(root, 'candidate.container.integration.test.ts'),
        "@RequiredContainer({ database: { kind: Container.SqlServer, isolation: 'shared' } }) class CandidateIntegrationTest {}",
      );
      const lifecycle = createVitestContainerGlobalSetup({
        root,
        registry: new ContainerRegistry().registerInstance(
          'database', Container.SqlServer, () => container,
        ),
        networkFactory: () => Promise.resolve(network),
        prepareResources: (resources) => {
          events.push(`prepared ${resources.getNamed('database', Container.SqlServer).database}`);
          return Promise.resolve(() => {
            events.push('preparation cleaned');
          });
        },
      });

      await lifecycle.setup({
        provide: (key, value) => {
          events.push('provided');
          providedKey = key;
          providedValue = value;
        },
      });
      await Promise.all([lifecycle.teardown(), lifecycle.teardown()]);

      expect(providedKey).toBe(CONTAINER_RESOURCES_CONTEXT_KEY);
      expect(providedValue).toEqual({
        database: {
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
      expect(events).toEqual(['prepared master', 'provided', 'preparation cleaned']);
    } finally {
      await rm(root, { recursive: true });
    }
  },
);

test('a dashboard startup failure warns and does not change container setup results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-fail-open-'));
  const start = vi.spyOn(DashboardSession.prototype, 'start')
    .mockRejectedValueOnce(new Error('dashboard port unavailable'));
  const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const lifecycle = createVitestContainerGlobalSetup({
    root,
    registry: new ContainerRegistry(),
    requiredContainerInstances: [],
    dashboard: { open: false, outputDirectory: 'reports' },
  });
  let provided = false;
  try {
    await lifecycle.setup({ provide: () => { provided = true; } });
    await lifecycle.teardown();

    expect(provided).toBe(true);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('disabled after startup failure'));
  } finally {
    start.mockRestore();
    warning.mockRestore();
    await lifecycle.teardown();
    await rm(root, { recursive: true, force: true });
  }
});

test('a discovery failure finalizes the Vitest dashboard session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vitest-dashboard-discovery-failure-'));
  const lifecycle = createVitestContainerGlobalSetup({
    root,
    registry: new ContainerRegistry(),
    dashboard: { open: false, outputDirectory: 'reports' },
  });
  try {
    await writeFile(
      join(root, 'invalid.container.integration.test.ts'),
      'class MissingRequiredContainerDeclaration {}',
    );

    await expect(lifecycle.setup({ provide: () => undefined }))
      .rejects.toThrow('expected one named @RequiredContainer');
    expect(process.env[DASHBOARD_SESSIONS_ENV]).toBeUndefined();
  } finally {
    await lifecycle.teardown();
    delete process.env[DASHBOARD_SESSIONS_ENV];
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'given resource preparation fails, when Vitest global setup runs, then containers are stopped and nothing is provided',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'container-global-setup-failure-'));
    const container = new FakeSqlServerContainer();
    const network = new FakeContainerNetwork();
    let provideCount = 0;
    try {
      await writeFile(
        join(root, 'candidate.container.integration.test.ts'),
        "@RequiredContainer({ database: { kind: Container.SqlServer, isolation: 'shared' } }) class CandidateIntegrationTest {}",
      );
      const failure = new Error('migration failed');
      const lifecycle = createVitestContainerGlobalSetup({
        root,
        registry: new ContainerRegistry().registerInstance(
          'database', Container.SqlServer, () => container,
        ),
        networkFactory: () => Promise.resolve(network),
        prepareResources: () => Promise.reject(failure),
      });

      await expect(
        lifecycle.setup({
          provide: () => {
            provideCount += 1;
          },
        }),
      ).rejects.toBe(failure);

      expect(provideCount).toBe(0);
      expect(container.stopCount).toBe(1);
      expect(network.stopCount).toBe(1);
    } finally {
      await rm(root, { recursive: true });
    }
  },
);
