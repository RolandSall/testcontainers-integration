import type {
  Container as ManagedContainer,
  ContainerNetwork,
  ContainerStartOptions,
  SqlServerResource,
} from '@integration-testing/testcontainers';
import { Container, ContainerRegistry } from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';

class FakeSqlServerContainer implements ManagedContainer<SqlServerResource> {
  readonly kind = Container.SqlServer;

  start(options?: ContainerStartOptions): Promise<SqlServerResource> {
    if (options?.network === undefined) throw new Error('Expected a shared network');
    return Promise.resolve({
      kind: this.kind,
      host: '127.0.0.1',
      port: 24_433,
      username: 'sa',
      password: 'fixture-password',
      database: 'master',
    });
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeNetwork implements ContainerNetwork {
  readonly native = {};

  stop(): Promise<void> {
    return Promise.resolve();
  }
}

const lifecycle = createVitestContainerGlobalSetup({
  root: import.meta.dirname,
  testFileSuffix: '.runner.test.ts',
  registry: new ContainerRegistry().register(
    Container.SqlServer,
    () => new FakeSqlServerContainer(),
  ),
  networkFactory: () => Promise.resolve(new FakeNetwork()),
});

export const setup = lifecycle.setup;
export const teardown = lifecycle.teardown;
