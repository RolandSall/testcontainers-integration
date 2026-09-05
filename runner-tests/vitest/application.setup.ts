import { Container } from '@integration-testing/testcontainers';
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';

interface FakeApplication {
  readonly port: number;
  close(): Promise<void>;
}

export const applicationContext = installVitestApplicationIntegrationTestSupport<FakeApplication>({
  start: (resources) => {
    const sqlServer = resources.get(Container.SqlServer);
    return Promise.resolve({ port: sqlServer.port, close: () => Promise.resolve() });
  },
  stop: (application) => application.close(),
});
