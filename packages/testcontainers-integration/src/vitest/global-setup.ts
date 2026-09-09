import type { ContainerRegistry } from '../container-registry.js';
import type { ContainerResources } from '../container-resources.js';
import type { ContainerKind } from '../container-resource-map.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeInstance } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
import { withCleanupFailures } from '../cleanup-failure.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
import {
  discoverSharedContainerInstances,
  type RequiredContainerDiscoveryOptions,
} from './required-container-scanner.js';

export interface VitestGlobalSetupProject {
  provide(key: string, value: unknown): void;
}

export interface VitestContainerGlobalSetupOptions
  extends RequiredContainerDiscoveryOptions,
    ContainerRuntimeOptions {
  readonly registry: ContainerRegistry;
  readonly requiredContainers?: readonly ContainerKind[];
  readonly requiredContainerInstances?: readonly ContainerRuntimeInstance[];
  readonly prepareResources?: (
    resources: ContainerResources,
  ) => Promise<undefined | (() => void | Promise<void>)>;
}

export interface VitestContainerGlobalSetup {
  setup(project: VitestGlobalSetupProject): Promise<void>;
  teardown(): Promise<void>;
}

/** Creates one globally shared Vitest container lifecycle. */
export const createVitestContainerGlobalSetup = (
  options: VitestContainerGlobalSetupOptions,
): VitestContainerGlobalSetup => {
  let runtime: ContainerRuntime | undefined;
  let preparationCleanup: (() => void | Promise<void>) | undefined;
  const logger = options.logger ?? consoleIntegrationTestLogger;
  return {
    setup: async (project) => {
      const instances = options.requiredContainerInstances ?? (
        options.requiredContainers === undefined
          ? await discoverSharedContainerInstances(options)
          : options.requiredContainers.map((kind) => ({ name: kind, kind }))
      );
      logger.info(
        'vitest',
        instances.length > 0
          ? `shared containers: ${instances.map(({ name }) => name).join(', ')}`
          : 'no shared containers found',
      );
      runtime = new ContainerRuntime(options.registry, options);
      try {
        const resources = await runtime.startInstances(instances);
        preparationCleanup = await options.prepareResources?.(resources);
        project.provide(CONTAINER_RESOURCES_CONTEXT_KEY, resources.toSerializable());
      } catch (error) {
        const activeRuntime = runtime;
        runtime = undefined;
        const cleanupFailures: unknown[] = [];
        try {
          await preparationCleanup?.();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        preparationCleanup = undefined;
        try {
          await activeRuntime.stop();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        throw withCleanupFailures(
          error,
          cleanupFailures,
          'Vitest container global setup failed and cleanup also failed',
        );
      }
    },
    teardown: async () => {
      const activeRuntime = runtime;
      runtime = undefined;
      if (activeRuntime === undefined) return;
      const failures: unknown[] = [];
      try {
        await preparationCleanup?.();
      } catch (error) {
        failures.push(error);
      }
      preparationCleanup = undefined;
      try {
        await activeRuntime.stop();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Vitest container global teardown failed');
      }
    },
  };
};
