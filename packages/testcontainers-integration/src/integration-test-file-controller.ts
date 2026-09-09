import type { ApplicationIntegrationTestClass } from './application-integration-test.js';
import { withCleanupFailures } from './cleanup-failure.js';
import {
  installProcessEnvironment,
  resolveContainerEnvironment,
} from './container-environment.js';
import { ContainerFileContext } from './container-file-context.js';
import type { PrepareFileContainerResources } from './container-file-context.js';
import type { ContainerEnvironmentReference } from './container-project.js';
import type { ContainerRegistry } from './container-registry.js';
import type { ContainerResources } from './container-resources.js';
import type { ContainerRuntimeOptions } from './container-runtime-options.js';
import { ApplicationIntegrationTestContextManager } from './environment/application-integration-test-context-manager.js';
import type { ApplicationIntegrationTestContextAccessor } from './environment/application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from './environment/application-lifecycle.js';
import type { RequiredContainerInstance } from './required-container.js';

/** Inputs resolved by a runner immediately before one test file executes. */
export interface IntegrationTestFileStartOptions {
  readonly declarations: readonly RequiredContainerInstance[];
  readonly sharedResources: ContainerResources;
  readonly registry: ContainerRegistry;
  readonly runtimeOptions?: ContainerRuntimeOptions;
  readonly environment?: Readonly<Record<string, ContainerEnvironmentReference>>;
  readonly applicationTestClass?: ApplicationIntegrationTestClass;
  readonly startApplication: boolean;
  readonly prepareResources?: PrepareFileContainerResources;
}

/** Coordinates one file's containers, environment, and optional SUT lifecycle. */
export class IntegrationTestFileController {
  private fileContext: ContainerFileContext | undefined;
  private applicationManager: ApplicationIntegrationTestContextManager<unknown> | undefined;
  private applicationLifecycle: ApplicationLifecycle<unknown> | undefined;
  private restoreEnvironment: (() => void) | undefined;

  configureApplication<TApplication>(
    lifecycle: ApplicationLifecycle<TApplication>,
  ): ApplicationIntegrationTestContextAccessor<TApplication> {
    if (this.applicationLifecycle !== undefined) {
      throw new Error('Application integration-test support is already installed');
    }
    this.applicationLifecycle = lifecycle;
    return {
      current: () => this.currentApplication() as TApplication,
    };
  }

  applicationIsConfigured(): boolean {
    return this.applicationLifecycle !== undefined;
  }

  async start(options: IntegrationTestFileStartOptions): Promise<void> {
    if (this.fileContext !== undefined) {
      throw new Error('Integration-test file lifecycle has already started');
    }
    const fileContext = new ContainerFileContext(options.registry, options.runtimeOptions);
    this.fileContext = fileContext;
    try {
      const resources = await fileContext.start(
        options.declarations,
        options.sharedResources,
        options.prepareResources,
      );
      if (!options.startApplication) return;
      const lifecycle = this.applicationLifecycle;
      if (lifecycle === undefined) {
        throw new Error(
          'Application integration-test support is not installed by the configured application setup module',
        );
      }
      this.restoreEnvironment = installProcessEnvironment(
        resolveContainerEnvironment(options.declarations, options.environment, resources),
      );
      const manager = new ApplicationIntegrationTestContextManager(lifecycle);
      this.applicationManager = manager;
      if (options.applicationTestClass === undefined) {
        await manager.startForInstances(options.declarations, resources);
      } else {
        await manager.start(options.applicationTestClass, resources);
      }
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
        'Integration-test file startup failed and cleanup also failed',
      );
    }
  }

  resources(): ContainerResources {
    const context = this.fileContext;
    if (context === undefined) {
      throw new Error(
        'Container resources are not ready. Read them from beforeAll, a test, or a later hook.',
      );
    }
    return context.current();
  }

  currentApplication(): unknown {
    const manager = this.applicationManager;
    if (manager === undefined) {
      throw new Error('Application integration-test context is not active');
    }
    return manager.current();
  }

  async stop(): Promise<void> {
    const failures: unknown[] = [];
    const manager = this.applicationManager;
    this.applicationManager = undefined;
    if (manager !== undefined) {
      try {
        await manager.stop();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      this.restoreEnvironment?.();
    } catch (error) {
      failures.push(error);
    }
    this.restoreEnvironment = undefined;
    const fileContext = this.fileContext;
    this.fileContext = undefined;
    if (fileContext !== undefined) {
      try {
        await fileContext.stop();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Integration-test file cleanup failed');
    }
  }
}
