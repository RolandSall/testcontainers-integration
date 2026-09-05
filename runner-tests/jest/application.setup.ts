import { Container } from '@integration-testing/testcontainers';
import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';

interface FakeApplication {
  readonly port: number;
  close(): Promise<void>;
}

export const applicationContext = installJestApplicationIntegrationTestSupport<FakeApplication>({
  start: (resources) => {
    const sqlServer = resources.get(Container.SqlServer);
    return Promise.resolve({ port: sqlServer.port, close: () => Promise.resolve() });
  },
  stop: (application) => application.close(),
});
