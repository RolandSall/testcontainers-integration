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
import type { SerializedIntegrationDashboardOptions } from '../dashboard/dashboard-config.js';
import { DashboardSession } from '../dashboard/dashboard-session.js';
import { DashboardIntegrationTestLogger } from '../dashboard/dashboard-logger.js';
import { dashboardErrorMessage } from '../dashboard/dashboard-event.js';

export interface JestContainerGlobalSetupOptions
  extends RequiredContainerDiscoveryOptions,
    ContainerRuntimeOptions {
  readonly registry: ContainerRegistry;
  readonly requiredContainers?: readonly ContainerKind[];
  readonly requiredContainerInstances?: readonly ContainerRuntimeInstance[];
  readonly prepareResources?: (
    resources: ContainerResources,
  ) => Promise<undefined | (() => void | Promise<void>)>;
  readonly dashboard?: SerializedIntegrationDashboardOptions;
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
  readonly dashboardSession?: DashboardSession;
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
  return {
    setup: async () => {
      if (states.has(stateKey)) return;
      const dashboardSession = await startDashboardSession(root, options.dashboard);
      const logger = dashboardSession === undefined
        ? options.logger ?? consoleIntegrationTestLogger
        : new DashboardIntegrationTestLogger(
          options.logger ?? consoleIntegrationTestLogger,
          dashboardSession,
        );
      let runtime: ContainerRuntime | undefined;
      let preparationCleanup: (() => void | Promise<void>) | undefined;
      let directory: string | undefined;
      try {
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
        runtime = new ContainerRuntime(options.registry, {
          ...options,
          logger,
          ...(dashboardSession === undefined ? {} : {
            eventSink: dashboardSession,
            eventContext: { isolation: 'shared' },
          }),
        });
        const resources = await runtime.startInstances(instances);
        if (options.prepareResources !== undefined) {
          const startedAt = Date.now();
          dashboardSession?.emit({
            type: 'resources.preparing', status: 'starting', scope: 'shared',
            message: 'preparing shared container resources',
          });
          try {
            preparationCleanup = await options.prepareResources(resources);
            dashboardSession?.emit({
              type: 'resources.ready', status: 'ready', scope: 'shared',
              message: 'shared container resources prepared', durationMs: Date.now() - startedAt,
            });
          } catch (error) {
            dashboardSession?.emit({
              type: 'resources.failed', status: 'failed', scope: 'shared',
              message: 'shared container resource preparation failed',
              durationMs: Date.now() - startedAt, error: dashboardErrorMessage(error),
            });
            throw error;
          }
        }
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
          ...(dashboardSession === undefined ? {} : { dashboardSession }),
        });
      } catch (error) {
        const cleanupFailures: unknown[] = [];
        try {
          await preparationCleanup?.();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        if (runtime !== undefined) {
          try {
            await runtime.stop();
          } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
          }
        }
        if (directory !== undefined) {
          try {
            await rm(directory, { recursive: true, force: true });
          } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
          }
        }
        await finalizeDashboardSession(dashboardSession);
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
      await finalizeDashboardSession(state.dashboardSession);
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Jest container global teardown failed');
      }
    },
  };
};

const startDashboardSession = async (
  root: string,
  options: SerializedIntegrationDashboardOptions | undefined,
): Promise<DashboardSession | undefined> => {
  if (options === undefined) return undefined;
  const session = new DashboardSession(root, 'jest', options);
  try {
    await session.start();
    return session;
  } catch (error) {
    process.stderr.write(
      `[integration:dashboard] disabled after startup failure: ${dashboardErrorMessage(error)}\n`,
    );
    return undefined;
  }
};

const finalizeDashboardSession = async (
  session: DashboardSession | undefined,
): Promise<void> => {
  if (session === undefined) return;
  try {
    await session.finalize();
  } catch (error) {
    process.stderr.write(
      `[integration:dashboard] finalization failed: ${dashboardErrorMessage(error)}\n`,
    );
  }
};
