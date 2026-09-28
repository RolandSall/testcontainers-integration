import type { Config } from 'jest';
import type {
  ContainerProjectApplication,
  ContainerProjectContainers,
} from '../container-project.js';
import { serializeContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import type { IntegrationDashboardConfiguration } from '../dashboard/dashboard-config.js';

export interface JestContainerProjectOptions<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> {
  readonly include: readonly string[];
  readonly containers: TContainers;
  readonly application?: string | ContainerProjectApplication<TContainers>;
  readonly containerLogs?: boolean;
  readonly dashboard?: IntegrationDashboardConfiguration;
  readonly jest?: Omit<
    Config,
    'testMatch' | 'globalSetup' | 'globalTeardown' | 'setupFilesAfterEnv' | 'globals'
  >;
}

/** Defines a Jest project with shared or file-dedicated named containers. */
export const defineContainerProject = <
  const TContainers extends ContainerProjectContainers,
>(options: JestContainerProjectOptions<TContainers>): Config => {
  const applicationSetup = typeof options.application === 'string'
    ? options.application
    : options.application?.setup;
  const environment = typeof options.application === 'object'
    ? options.application.environment
    : undefined;
  const reporters = dashboardReporters(options.dashboard, options.jest?.reporters);
  return {
    ...options.jest,
    ...(reporters === undefined ? {} : { reporters }),
    testMatch: [...options.include],
    globalSetup: '@integration-testing/testcontainers/jest/project-global-setup',
    globalTeardown: '@integration-testing/testcontainers/jest/project-global-teardown',
    setupFilesAfterEnv: [
      '@integration-testing/testcontainers/jest/file-setup',
      ...(applicationSetup === undefined ? [] : [applicationSetup]),
    ],
    globals: {
      [CONTAINER_PROJECT_CONTEXT_KEY]: serializeContainerProject(
        options.containers,
        environment,
        options.containerLogs,
        options.dashboard,
      ),
    },
  };
};

const dashboardReporters = (
  dashboard: IntegrationDashboardConfiguration | undefined,
  reporters: Config['reporters'],
): Config['reporters'] => {
  if (dashboard === undefined || dashboard === false) return reporters;
  if (reporters === undefined) {
    return ['default', '@integration-testing/testcontainers/jest/dashboard-reporter'];
  }
  return [...reporters, '@integration-testing/testcontainers/jest/dashboard-reporter'];
};

export const defineJestContainerProject = defineContainerProject;
