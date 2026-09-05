import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ContainerRegistry } from '../container-registry.js';
import type { ContainerResources } from '../container-resources.js';
import type { ContainerKind } from '../container-resource-map.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
import type { ContainerRuntimeInstance } from '../container-runtime.js';
import { withCleanupFailures } from '../cleanup-failure.js';
import {
  discoverRequiredContainers,
  type RequiredContainerDiscoveryOptions,
} from '../discovery/required-container-discovery.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from './context-key.js';

/** Discovery, runtime, and registry configuration for Jest global setup. */
export interface JestContainerGlobalSetupOptions
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

/** Idempotent setup and teardown callbacks configured in Jest. */
export interface JestContainerGlobalSetup {
  /** Starts shared containers and writes their serializable resources for workers. */
  setup(): Promise<void>;
  /** Stops shared containers and removes the protected resource document. */
  teardown(): Promise<void>;
}

interface JestContainerGlobalState {
  readonly runtime: ContainerRuntime;
  readonly directory: string;
  readonly resourcePath: string;
  readonly cleanupPreparedResources?: () => void;
}

interface JestContainerGlobalStateOwner {
  __containerIntegrationTestingJestStates?: Map<string, JestContainerGlobalState>;
}

/**
 * Creates Jest global setup and teardown callbacks backed by one shared runtime.
 *
 * Put the returned object in one lifecycle module, then export its `setup` and `teardown`
 * methods from the two modules referenced by Jest configuration.
 */
export const createJestContainerGlobalSetup = (
  options: JestContainerGlobalSetupOptions,
): JestContainerGlobalSetup => {
  const stateKey = resolve(options.root);
  const logger = options.logger ?? consoleIntegrationTestLogger;

  return {
    setup: async () => {
      const states = globalStates();
      if (states.has(stateKey)) {
        return;
      }
      logger.info(
        'jest',
        options.requiredContainers === undefined && options.requiredContainerInstances === undefined
          ? 'discovering required containers'
          : 'reading configured containers',
      );
      const instances = options.requiredContainerInstances;
      const kinds = instances === undefined
        ? options.requiredContainers ?? await discoverRequiredContainers(options)
        : instances.map(({ kind }) => kind);
      logger.info(
        'jest',
        kinds.length > 0
          ? `required containers: ${kinds.join(', ')}`
          : 'no required containers found',
      );
      const runtime = new ContainerRuntime(options.registry, options);
      let directory: string | undefined;
      let cleanupPreparedResources: (() => void) | undefined;
      const resources: ContainerResources = instances === undefined
        ? await runtime.start(kinds)
        : await runtime.startInstances(instances);
      try {
        if (options.prepareResources !== undefined) {
          logger.info('jest', 'preparing container resources');
          const preparationCleanup = await options.prepareResources(resources);
          if (typeof preparationCleanup === 'function') {
            cleanupPreparedResources = preparationCleanup;
          }
          logger.info('jest', 'container resources are ready');
        }
        directory = await mkdtemp(join(tmpdir(), 'integration-testing-jest-'));
        const resourcePath = join(directory, 'resources.json');
        await writeFile(
          resourcePath,
          JSON.stringify(resources.toSerializable()),
          { encoding: 'utf8', mode: 0o600 },
        );
        process.env[JEST_CONTAINER_RESOURCES_PATH_ENV] = resourcePath;
        states.set(stateKey, {
          runtime,
          directory,
          resourcePath,
          ...(cleanupPreparedResources === undefined
            ? {}
            : { cleanupPreparedResources }),
        });
        logger.info('jest', 'container resources provided to test workers');
      } catch (error) {
        const cleanupFailures: unknown[] = [];
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
        try {
          cleanupPreparedResources?.();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        throw withCleanupFailures(
          error,
          cleanupFailures,
          'Jest container global setup failed and cleanup also failed',
        );
      }
    },
    teardown: async () => {
      const states = globalStates();
      const state = states.get(stateKey);
      if (state === undefined) {
        return;
      }
      states.delete(stateKey);
      if (process.env[JEST_CONTAINER_RESOURCES_PATH_ENV] === state.resourcePath) {
        delete process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
      }
      const failures: unknown[] = [];
      logger.info('jest', 'tearing down integration test containers');
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
      try {
        state.cleanupPreparedResources?.();
      } catch (error) {
        failures.push(error);
      }
      logger.info('jest', 'integration test container teardown finished');
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Jest container global teardown failed');
      }
    },
  };
};

const globalStates = (): Map<string, JestContainerGlobalState> => {
  const owner = globalThis as typeof globalThis & JestContainerGlobalStateOwner;
  owner.__containerIntegrationTestingJestStates ??= new Map();
  return owner.__containerIntegrationTestingJestStates;
};
