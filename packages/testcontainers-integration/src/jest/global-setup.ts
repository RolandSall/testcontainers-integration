import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ContainerRegistry } from '../container-registry.js';
import type { ContainerResources } from '../container-resources.js';
import type { ContainerKind } from '../container-resource-map.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeInstance } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
import { withCleanupFailures } from '../cleanup-failure.js';
import {
  discoverSharedContainerInstances,
  type RequiredContainerDiscoveryOptions,
} from '../discovery/required-container-discovery.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from './context-key.js';

export interface JestContainerGlobalSetupOptions
  extends RequiredContainerDiscoveryOptions,
    ContainerRuntimeOptions {
  readonly registry: ContainerRegistry;
  readonly requiredContainers?: readonly ContainerKind[];
  readonly requiredContainerInstances?: readonly ContainerRuntimeInstance[];
  readonly prepareResources?: (
    resources: ContainerResources,
  ) => Promise<undefined | (() => void | Promise<void>)>;
}

export interface JestContainerGlobalSetup {
  setup(): Promise<void>;
  teardown(): Promise<void>;
}

interface JestContainerGlobalState {
  readonly runtime: ContainerRuntime;
  readonly directory: string;
  readonly resourcePath: string;
  readonly preparationCleanup?: () => void | Promise<void>;
}

interface JestContainerGlobalStateOwner {
  __containerIntegrationTestingJestStates?: Map<string, JestContainerGlobalState>;
}

/** Creates one globally shared Jest container lifecycle. */
export const createJestContainerGlobalSetup = (
  options: JestContainerGlobalSetupOptions,
): JestContainerGlobalSetup => {
  const root = resolve(options.root);
  const stateKey = root;
  const stateOwner = globalThis as typeof globalThis & JestContainerGlobalStateOwner;
  const states = stateOwner.__containerIntegrationTestingJestStates ??= new Map();
  const logger = options.logger ?? consoleIntegrationTestLogger;
  return {
    setup: async () => {
      if (states.has(stateKey)) return;
      const instances = options.requiredContainerInstances ?? (
        options.requiredContainers === undefined
          ? await discoverSharedContainerInstances(options)
          : options.requiredContainers.map((kind) => ({ name: kind, kind }))
      );
      logger.info(
        'jest',
        instances.length > 0
          ? `shared containers: ${instances.map(({ name }) => name).join(', ')}`
          : 'no shared containers found',
      );
      const runtime = new ContainerRuntime(options.registry, options);
      let preparationCleanup: (() => void | Promise<void>) | undefined;
      let directory: string | undefined;
      try {
        const resources = await runtime.startInstances(instances);
        preparationCleanup = await options.prepareResources?.(resources);
        directory = await mkdtemp(join(tmpdir(), 'integration-testing-jest-'));
        const resourcePath = join(directory, 'resources.json');
        await writeFile(resourcePath, JSON.stringify(resources.toSerializable()), {
          encoding: 'utf8',
          mode: 0o600,
        });
        process.env[JEST_CONTAINER_RESOURCES_PATH_ENV] = resourcePath;
        states.set(stateKey, {
          runtime,
          directory,
          resourcePath,
          ...(preparationCleanup === undefined ? {} : { preparationCleanup }),
        });
      } catch (error) {
        const cleanupFailures: unknown[] = [];
        try {
          await preparationCleanup?.();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        try {
          await runtime.stop();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        if (directory !== undefined) {
          try {
            await rm(directory, { recursive: true, force: true });
          } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
          }
        }
        throw withCleanupFailures(
          error,
          cleanupFailures,
          'Jest container global setup failed and cleanup also failed',
        );
      }
    },
    teardown: async () => {
      const state = states.get(stateKey);
      if (state === undefined) return;
      states.delete(stateKey);
      delete process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
      const failures: unknown[] = [];
      try {
        await state.preparationCleanup?.();
      } catch (error) {
        failures.push(error);
      }
      try {
        await state.runtime.stop();
      } catch (error) {
        failures.push(error);
      }
      try {
        await rm(state.directory, { recursive: true, force: true });
      } catch (error) {
        failures.push(error);
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Jest container global teardown failed');
      }
    },
  };
};
