import { Container } from '../container-kind.js';
import { installVitestApplicationIntegrationTestSupport } from './install-vitest-application-integration-test-support.js';

export interface FakeApiApplication {
  readonly databasePort: number;
}

export const applicationLifecycleEvents: string[] = [];

export const testApiApplicationContext =
  installVitestApplicationIntegrationTestSupport<FakeApiApplication>({
    start: (resources) => {
      applicationLifecycleEvents.push('application started');
      return Promise.resolve({
        databasePort: resources.get(Container.SqlServer).port,
      });
    },
    stop: () => {
      applicationLifecycleEvents.push('application stopped');
      return Promise.resolve();
    },
  });
