import type { ApplicationIntegrationTestClass } from '../application-integration-test.js';
import type { ContainerResources } from '../container-resources.js';
import type { ContainerKind } from '../container-resource-map.js';
import type { ContainerRuntimeInstance } from '../container-runtime.js';
import { requiredContainersFor } from '../required-container.js';
import type { ApplicationIntegrationTestContextAccessor } from './application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from './application-lifecycle.js';

/** Starts one application with an already prepared named resource collection. */
export class ApplicationIntegrationTestContextManager<TApplication>
  implements ApplicationIntegrationTestContextAccessor<TApplication>
{
  private applicationInstance: TApplication | undefined;
  private starting = false;

  constructor(private readonly application: ApplicationLifecycle<TApplication>) {}

  async start(
    testClass: ApplicationIntegrationTestClass,
    resources: ContainerResources,
  ): Promise<void> {
    const requiredContainers = requiredContainersFor(testClass);
    if (requiredContainers.length === 0) {
      throw new Error('@ApplicationIntegrationTest requires @RequiredContainer(...) on the same class');
    }
    await this.startForInstances(requiredContainers, resources);
  }

  async startFor(
    requiredContainers: readonly ContainerKind[],
    resources: ContainerResources,
  ): Promise<void> {
    for (const kind of requiredContainers) resources.get(kind);
    await this.startApplication(resources);
  }

  async startForInstances(
    requiredContainers: readonly ContainerRuntimeInstance[],
    resources: ContainerResources,
  ): Promise<void> {
    for (const { name, kind } of requiredContainers) resources.getNamed(name, kind);
    await this.startApplication(resources);
  }

  current(): TApplication {
    if (this.applicationInstance === undefined) {
      throw new Error('Application integration-test context is not active');
    }
    return this.applicationInstance;
  }

  async stop(): Promise<void> {
    const application = this.applicationInstance;
    this.applicationInstance = undefined;
    if (application !== undefined) await this.application.stop(application);
  }

  private async startApplication(resources: ContainerResources): Promise<void> {
    if (this.applicationInstance !== undefined || this.starting) {
      throw new Error('Application integration-test context has already started');
    }
    this.starting = true;
    try {
      this.applicationInstance = await this.application.start(resources);
    } finally {
      this.starting = false;
    }
  }
}
