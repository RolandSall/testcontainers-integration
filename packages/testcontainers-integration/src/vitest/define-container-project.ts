import type { ViteUserConfig } from 'vitest/config';
import type {
  ContainerProjectApplication,
  ContainerProjectContainers,
} from '../container-project.js';
import { serializeContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';

/** Concise, explicit configuration for a Vitest integration-test project. */
export interface VitestContainerProjectOptions<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> {
  readonly include: readonly string[];
  readonly containers: TContainers;
  readonly application?: string | ContainerProjectApplication<TContainers>;
  readonly hookTimeout?: number;
  readonly testTimeout?: number;
}

/**
 * Defines a complete Vitest project without custom lifecycle glue or decorators.
 */
export const defineContainerProject = <
  const TContainers extends ContainerProjectContainers,
>(
  options: VitestContainerProjectOptions<TContainers>,
): ViteUserConfig => {
  const applicationSetup = typeof options.application === 'string'
    ? options.application
    : options.application?.setup;
  const environment = typeof options.application === 'object'
    ? options.application.environment
    : undefined;
  return ({
  test: {
    include: [...options.include],
    globalSetup: ['@integration-testing/testcontainers/vitest/project-global-setup'],
    ...(applicationSetup === undefined
      ? {}
      : { setupFiles: [applicationSetup] }),
    ...(options.hookTimeout === undefined ? {} : { hookTimeout: options.hookTimeout }),
    ...(options.testTimeout === undefined ? {} : { testTimeout: options.testTimeout }),
    provide: {
      [CONTAINER_PROJECT_CONTEXT_KEY]: serializeContainerProject(
        options.containers,
        environment,
      ),
    },
  },
  });
};

/** Explicit runner-qualified alias for mixed-runner documentation and tooling. */
export const defineVitestContainerProject = defineContainerProject;
