import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ContainerRegistry } from '../container-registry.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
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
      logger.info('jest', 'discovering required containers');
      const kinds = await discoverRequiredContainers(options);
      logger.info(
        'jest',
        kinds.length > 0
          ? `required containers: ${kinds.join(', ')}`
          : 'no required containers found',
      );
      const runtime = new ContainerRuntime(options.registry, options);
      let directory: string | undefined;
      try {
        const resources = await runtime.start(kinds);
        directory = await mkdtemp(join(tmpdir(), 'container-integration-testing-jest-'));
        const resourcePath = join(directory, 'resources.json');
        await writeFile(
          resourcePath,
          JSON.stringify(resources.toSerializable()),
          { encoding: 'utf8', mode: 0o600 },
        );
        process.env[JEST_CONTAINER_RESOURCES_PATH_ENV] = resourcePath;
        states.set(stateKey, { runtime, directory, resourcePath });
        logger.info('jest', 'container resources provided to test workers');
      } catch (error) {
        const failures: unknown[] = [error];
        try {
          await runtime.stop();
        } catch (cleanupError) {
          failures.push(cleanupError);
        }
        if (directory !== undefined) {
          try {
            await rm(directory, { recursive: true, force: true });
          } catch (cleanupError) {
            failures.push(cleanupError);
          }
        }
        if (failures.length === 1) {
          throw error;
        }
        throw new AggregateError(failures, 'Jest container global setup failed');
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
