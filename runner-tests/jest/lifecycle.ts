import type {
  Container as ManagedContainer,
  ContainerNetwork,
  ContainerStartOptions,
  SqlServerResource,
} from '@integration-testing/testcontainers';
import { resolve } from 'node:path';
import { Container, ContainerRegistry } from '@integration-testing/testcontainers';
import { createJestContainerGlobalSetup } from '@integration-testing/testcontainers/jest';

class FakeSqlServerContainer implements ManagedContainer<SqlServerResource> {
  readonly kind = Container.SqlServer;

  start(options?: ContainerStartOptions): Promise<SqlServerResource> {
    if (options?.network === undefined) {
      throw new Error('The fake container must receive the shared network');
    }
    return Promise.resolve({
      kind: this.kind,
      host: '127.0.0.1',
      port: 14_433,
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

export const lifecycle = createJestContainerGlobalSetup({
  root: resolve(process.cwd(), 'runner-tests/jest'),
  testFileSuffix: '.runner.test.ts',
  registry: new ContainerRegistry().register(
    Container.SqlServer,
    () => new FakeSqlServerContainer(),
  ),
  networkFactory: () => Promise.resolve(new FakeNetwork()),
});
