import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';
import { terminationApplicationLifecycle } from './application-lifecycle.js';

installJestApplicationIntegrationTestSupport(terminationApplicationLifecycle);
