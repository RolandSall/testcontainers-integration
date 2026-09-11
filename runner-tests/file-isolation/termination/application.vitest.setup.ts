import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';
import { terminationApplicationLifecycle } from './application-lifecycle.js';

installVitestApplicationIntegrationTestSupport(terminationApplicationLifecycle);
