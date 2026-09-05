import type { ContainerResources } from '../container-resources.js';

/** Starts and stops an application that depends on container resources. */
export interface ApplicationLifecycle<TApplication> {
  /** Starts the application after all required container resources are ready. */
  start(resources: ContainerResources): Promise<TApplication>;
  /** Stops the application before its owned containers are stopped. */
  stop(application: TApplication): Promise<void>;
}
