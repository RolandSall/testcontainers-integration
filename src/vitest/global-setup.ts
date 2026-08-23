import type { ContainerRegistry } from '../container-registry.js';
import type { ContainerResources } from '../container-resources.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
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
  /** Prepares started resources before they are made visible to test workers. */
  readonly prepareResources?: (resources: ContainerResources) => Promise<void>;
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
  const logger = options.logger ?? consoleIntegrationTestLogger;

  return {
    setup: async (project) => {
      logger.info('vitest', 'discovering required containers');
      const kinds = await discoverRequiredContainers(options);
      logger.info(
        'vitest',
        kinds.length > 0
          ? `required containers: ${kinds.join(', ')}`
          : 'no required containers found',
      );
      runtime = new ContainerRuntime(options.registry, options);
      try {
        const resources = await runtime.start(kinds);
        if (options.prepareResources !== undefined) {
          logger.info('vitest', 'preparing container resources');
          await options.prepareResources(resources);
          logger.info('vitest', 'container resources are ready');
        }
        project.provide(CONTAINER_RESOURCES_CONTEXT_KEY, resources.toSerializable());
        logger.info('vitest', 'container resources provided to test workers');
      } catch (error) {
        const activeRuntime = runtime;
        runtime = undefined;
        await activeRuntime.stop();
        throw error;
      }
    },
    teardown: async () => {
      const activeRuntime = runtime;
      runtime = undefined;
      if (activeRuntime === undefined) {
        return;
      }

      logger.info('vitest', 'tearing down integration test containers');
      await activeRuntime.stop();
      logger.info('vitest', 'integration test container teardown finished');
    },
  };
};
