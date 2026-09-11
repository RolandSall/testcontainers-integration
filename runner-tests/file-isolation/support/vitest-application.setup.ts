import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';
import { FileIsolationBackend } from './fixture-backend.js';

export const applicationContext = installVitestApplicationIntegrationTestSupport({
  start: FileIsolationBackend.start,
  stop: (application) => application.close(),
});
