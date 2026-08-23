import type { ApplicationIntegrationTestClass } from '../application-integration-test.js';
import type { ContainerResources } from '../container-resources.js';
import { requiredContainersFor } from '../required-container.js';
import type { ApplicationIntegrationTestContextAccessor } from './application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from './application-lifecycle.js';
import { IntegrationEnvironment } from './integration-environment.js';
import { ProvidedContainerSource } from './provided-container-source.js';

/**
 * Runner-neutral manager that starts one application for an annotated test file.
 *
 * Runner adapters discover the marker and translate their hooks into `start()` and `stop()`.
 */
export class ApplicationIntegrationTestContextManager<TApplication>
  implements ApplicationIntegrationTestContextAccessor<TApplication>
{
  private environment: IntegrationEnvironment<TApplication> | undefined;

  /** Creates a manager for the application lifecycle installed by the consumer. */
  constructor(private readonly application: ApplicationLifecycle<TApplication>) {}

  /** Validates requirements and starts the application with already-running resources. */
  async start(
    testClass: ApplicationIntegrationTestClass,
    resources: ContainerResources,
  ): Promise<void> {
    if (this.environment !== undefined) {
      throw new Error('Application integration-test context has already started');
    }
    const requiredContainers = requiredContainersFor(testClass);
    if (requiredContainers.length === 0) {
      throw new Error(
        '@ApplicationIntegrationTest requires @RequiredContainer(...) on the same class',
      );
    }
    const environment = new IntegrationEnvironment({
      requiredContainers,
      containers: new ProvidedContainerSource(resources),
      application: this.application,
    });
    this.environment = environment;
    await environment.start();
  }

  /** Returns the application started for the active annotated test file. */
  current(): TApplication {
    const activeEnvironment = this.environment;
    if (activeEnvironment === undefined) {
      throw new Error('Application integration-test context is not active');
    }
    return activeEnvironment.current().application;
  }

  /** Stops the active application and clears the file-level context. */
  async stop(): Promise<void> {
    const activeEnvironment = this.environment;
    this.environment = undefined;
    await activeEnvironment?.stop();
  }
}
