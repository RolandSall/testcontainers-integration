import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';
import { FileIsolationBackend } from './fixture-backend';

export const applicationContext = installJestApplicationIntegrationTestSupport({
  start: FileIsolationBackend.start,
  stop: (application) => application.close(),
});
