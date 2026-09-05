import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';
import { ExampleBackend } from '../../support/example-backend.js';

export const applicationContext = installJestApplicationIntegrationTestSupport({
  start: ExampleBackend.start,
  stop: (application) => application.close(),
});
