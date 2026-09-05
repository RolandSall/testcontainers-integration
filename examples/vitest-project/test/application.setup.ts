import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';
import { ExampleBackend } from '../../support/example-backend.js';

export const applicationContext = installVitestApplicationIntegrationTestSupport({
  start: ExampleBackend.startFromEnvironment,
  stop: (application) => application.close(),
});
