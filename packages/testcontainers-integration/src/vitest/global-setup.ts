import type { ContainerRegistry } from '../container-registry.js';
import type { ContainerResources } from '../container-resources.js';
import type { ContainerKind } from '../container-resource-map.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
import type { ContainerRuntimeInstance } from '../container-runtime.js';
import { withCleanupFailures } from '../cleanup-failure.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
import {
  discoverRequiredContainers,
  type RequiredContainerDiscoveryOptions,
} from './required-container-scanner.js';

/** Minimal Vitest project capability required to provide worker context. */
export interface VitestGlobalSetupProject {
  /** Makes serializable data available through Vitest `inject()`. */
  provide(key: string, value: unknown): void;
}

/** Discovery, runtime, and registry configuration for Vitest global setup. */
export interface VitestContainerGlobalSetupOptions
  extends RequiredContainerDiscoveryOptions,
    ContainerRuntimeOptions {
  readonly registry: ContainerRegistry;
  /** Uses an explicit list instead of scanning decorators when supplied. */
  readonly requiredContainers?: readonly ContainerKind[];
  /** Uses explicit named instances, including repeated kinds, when supplied. */
  readonly requiredContainerInstances?: readonly ContainerRuntimeInstance[];
  /** Prepares started resources before they are made visible to test workers. */
  readonly prepareResources?: (
    resources: ContainerResources,
  ) => Promise<undefined | (() => void)>;
}

/** Idempotent setup and teardown callbacks exported to Vitest. */
export interface VitestContainerGlobalSetup {
  /** Discovers requirements, starts containers, and provides their resources. */
  setup(project: VitestGlobalSetupProject): Promise<void>;
  /** Stops containers and their shared network after all test workers finish. */
  teardown(): Promise<void>;
}

/**
 * Creates Vitest global lifecycle callbacks backed by one `ContainerRuntime`.
 *
 * The returned object is assigned to the `setup` and `teardown` exports of a Vitest global
 * setup module.
 */
export const createVitestContainerGlobalSetup = (
  options: VitestContainerGlobalSetupOptions,
): VitestContainerGlobalSetup => {
  let runtime: ContainerRuntime | undefined;
  let cleanupPreparedResources: (() => void) | undefined;
  const logger = options.logger ?? consoleIntegrationTestLogger;

  return {
    setup: async (project) => {
      logger.info(
        'vitest',
        options.requiredContainers === undefined && options.requiredContainerInstances === undefined
          ? 'discovering required containers'
          : 'reading configured containers',
      );
      const instances = options.requiredContainerInstances;
      const kinds = instances === undefined
        ? options.requiredContainers ?? await discoverRequiredContainers(options)
        : instances.map(({ kind }) => kind);
      logger.info(
        'vitest',
        kinds.length > 0
          ? `required containers: ${kinds.join(', ')}`
          : 'no required containers found',
      );
      runtime = new ContainerRuntime(options.registry, options);
      let resources: ContainerResources;
      try {
        resources = instances === undefined
          ? await runtime.start(kinds)
          : await runtime.startInstances(instances);
      } catch (error) {
        runtime = undefined;
        throw error;
      }
      try {
        if (options.prepareResources !== undefined) {
          logger.info('vitest', 'preparing container resources');
          const preparationCleanup = await options.prepareResources(resources);
          if (typeof preparationCleanup === 'function') {
            cleanupPreparedResources = preparationCleanup;
          }
          logger.info('vitest', 'container resources are ready');
        }
        project.provide(CONTAINER_RESOURCES_CONTEXT_KEY, resources.toSerializable());
        logger.info('vitest', 'container resources provided to test workers');
      } catch (error) {
        const activeRuntime = runtime;
        runtime = undefined;
        const cleanupFailures: unknown[] = [];
        try {
          await activeRuntime.stop();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        try {
          cleanupPreparedResources?.();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        cleanupPreparedResources = undefined;
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
      if (activeRuntime === undefined) {
        return;
      }

      logger.info('vitest', 'tearing down integration test containers');
      const failures: unknown[] = [];
      try {
        await activeRuntime.stop();
      } catch (error) {
        failures.push(error);
      }
      try {
        cleanupPreparedResources?.();
      } catch (error) {
        failures.push(error);
      }
      cleanupPreparedResources = undefined;
      logger.info('vitest', 'integration test container teardown finished');
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Vitest container global teardown failed');
      }
    },
  };
};
