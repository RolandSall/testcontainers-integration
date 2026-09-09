import type { ApplicationIntegrationTestContextAccessor } from '../environment/application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from '../environment/application-lifecycle.js';
import {
  configureVitestApplication,
  installVitestContainerFileSupport,
} from './file-lifecycle.js';

/** Registers the SUT lifecycle consumed by the package-owned per-file hooks. */
export const installVitestApplicationIntegrationTestSupport = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> => {
  installVitestContainerFileSupport();
  return configureVitestApplication(lifecycle);
};
