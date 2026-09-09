import type { Config } from 'jest';
import type {
  ContainerProjectApplication,
  ContainerProjectContainers,
} from '../container-project.js';
import { serializeContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';

export interface JestContainerProjectOptions<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> {
  readonly include: readonly string[];
  readonly containers: TContainers;
  readonly application?: string | ContainerProjectApplication<TContainers>;
  readonly containerLogs?: boolean;
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
  return {
    ...options.jest,
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
      ),
    },
  };
};

export const defineJestContainerProject = defineContainerProject;
