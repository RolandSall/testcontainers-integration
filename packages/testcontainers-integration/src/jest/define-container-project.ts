import type { Config } from 'jest';
import type {
  ContainerProjectApplication,
  ContainerProjectContainers,
} from '../container-project.js';
import { serializeContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';

/** Concise, explicit configuration for a Jest integration-test project. */
export interface JestContainerProjectOptions<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> {
  readonly include: readonly string[];
  readonly containers: TContainers;
  readonly application?: string | ContainerProjectApplication<TContainers>;
  /** Runner-specific options such as ts-jest transform configuration. */
  readonly jest?: Omit<Config, 'testMatch' | 'globalSetup' | 'globalTeardown' | 'setupFilesAfterEnv' | 'globals'>;
}

/**
 * Defines a complete Jest project without custom lifecycle glue or decorators.
 */
export const defineContainerProject = <
  const TContainers extends ContainerProjectContainers,
>(
  options: JestContainerProjectOptions<TContainers>,
): Config => {
  const applicationSetup = typeof options.application === 'string'
    ? options.application
    : options.application?.setup;
  const environment = typeof options.application === 'object'
    ? options.application.environment
    : undefined;
  return ({
  ...options.jest,
  testMatch: [...options.include],
  globalSetup: '@integration-testing/testcontainers/jest/project-global-setup',
  globalTeardown: '@integration-testing/testcontainers/jest/project-global-teardown',
  ...(applicationSetup === undefined
    ? {}
    : { setupFilesAfterEnv: [applicationSetup] }),
  globals: {
    [CONTAINER_PROJECT_CONTEXT_KEY]: serializeContainerProject(
      options.containers,
      environment,
    ),
  },
  });
};

/** Explicit runner-qualified alias for mixed-runner documentation and tooling. */
export const defineJestContainerProject = defineContainerProject;
