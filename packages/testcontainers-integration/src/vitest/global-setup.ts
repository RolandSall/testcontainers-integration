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
import type { SerializedIntegrationDashboardOptions } from '../dashboard/dashboard-config.js';
import { DashboardSession } from '../dashboard/dashboard-session.js';
import { DashboardIntegrationTestLogger } from '../dashboard/dashboard-logger.js';
import { dashboardErrorMessage } from '../dashboard/dashboard-event.js';

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
  readonly dashboard?: SerializedIntegrationDashboardOptions;
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
  let dashboardSession: DashboardSession | undefined;
  return {
    setup: async (project) => {
      dashboardSession = await startDashboardSession(options.root, options.dashboard);
      const logger = dashboardSession === undefined
        ? options.logger ?? consoleIntegrationTestLogger
        : new DashboardIntegrationTestLogger(
          options.logger ?? consoleIntegrationTestLogger,
          dashboardSession,
        );
      try {
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
        if (activeRuntime !== undefined) {
          try {
            await activeRuntime.stop();
          } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
          }
        }
        await finalizeDashboardSession(dashboardSession);
        dashboardSession = undefined;
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
      const failures: unknown[] = [];
      if (activeRuntime !== undefined) {
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
      }
      await finalizeDashboardSession(dashboardSession);
      dashboardSession = undefined;
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Vitest container global teardown failed');
      }
    },
  };
};

const startDashboardSession = async (
  root: string,
  options: SerializedIntegrationDashboardOptions | undefined,
): Promise<DashboardSession | undefined> => {
  if (options === undefined) return undefined;
  const session = new DashboardSession(root, 'vitest', options);
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
