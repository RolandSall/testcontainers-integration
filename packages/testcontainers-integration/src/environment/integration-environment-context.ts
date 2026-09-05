import type { ContainerResources } from '../container-resources.js';

/** Application and container resources available after an environment starts. */
export interface IntegrationEnvironmentContext<TApplication> {
  /** Resources returned by the required containers. */
  readonly resources: ContainerResources;
  /** Application instance created from those resources. */
  readonly application: TApplication;
}
