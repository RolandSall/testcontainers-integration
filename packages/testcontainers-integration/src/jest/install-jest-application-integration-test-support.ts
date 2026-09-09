import type { ApplicationIntegrationTestContextAccessor } from '../environment/application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from '../environment/application-lifecycle.js';
import {
  configureJestApplication,
  installJestContainerFileSupport,
} from './file-lifecycle.js';

/** Registers the SUT lifecycle consumed by the package-owned per-file hooks. */
export const installJestApplicationIntegrationTestSupport = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> => {
  installJestContainerFileSupport();
  return configureJestApplication(lifecycle);
};
