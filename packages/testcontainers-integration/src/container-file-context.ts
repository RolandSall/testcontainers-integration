import { withCleanupFailures } from './cleanup-failure.js';
import type { ContainerRegistry } from './container-registry.js';
import { ContainerResources } from './container-resources.js';
import { ContainerRuntime } from './container-runtime.js';
import type { ContainerRuntimeOptions } from './container-runtime-options.js';
import type { RequiredContainerInstance } from './required-container.js';

/** Prepares one file's combined shared and dedicated resources. */
export type PrepareFileContainerResources = (
  resources: ContainerResources,
) => Promise<undefined | (() => void | Promise<void>)>;

/** Owns the dedicated containers and combined resources for one test file. */
export class ContainerFileContext {
  private runtime: ContainerRuntime | undefined;
  private resources: ContainerResources | undefined;
  private preparationCleanup: (() => void | Promise<void>) | undefined;
  private stopPromise: Promise<void> | undefined;

  constructor(
    private readonly registry: ContainerRegistry,
    private readonly options: ContainerRuntimeOptions = {},
  ) {}

  async start(
    declarations: readonly RequiredContainerInstance[],
    sharedResources: ContainerResources,
    prepareResources?: PrepareFileContainerResources,
  ): Promise<ContainerResources> {
    if (this.resources !== undefined) {
      throw new Error('Container file context has already started');
    }
    if (this.stopPromise !== undefined) {
      throw new Error('Container file context has already stopped');
    }
    const shared = sharedResources.select(
      declarations.filter(({ isolation }) => isolation === 'shared'),
    );
    const dedicated = declarations.filter(({ isolation }) => isolation === 'dedicated');
    this.runtime = new ContainerRuntime(this.registry, this.options);
    try {
      const dedicatedResources = await this.runtime.startInstances(dedicated);
      const resources = ContainerResources.merge(shared, dedicatedResources);
      this.resources = resources;
      this.preparationCleanup = await prepareResources?.(resources);
      return resources;
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      try {
        await this.stop();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
      throw withCleanupFailures(
        error,
        cleanupFailures,
        'Container file setup failed and cleanup also failed',
      );
    }
  }

  current(): ContainerResources {
    if (this.resources === undefined) {
      throw new Error(
        'Container resources are not ready. Read them from beforeAll, a test, or a later hook.',
      );
    }
    return this.resources;
  }

  stop(): Promise<void> {
    this.stopPromise ??= this.stopAll();
    return this.stopPromise;
  }

  private async stopAll(): Promise<void> {
    const failures: unknown[] = [];
    const cleanup = this.preparationCleanup;
    this.preparationCleanup = undefined;
    if (cleanup !== undefined) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    const runtime = this.runtime;
    this.runtime = undefined;
    if (runtime !== undefined) {
      try {
        await runtime.stop();
      } catch (error) {
        failures.push(error);
      }
    }
    this.resources = undefined;
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Container file cleanup failed');
    }
  }
}
