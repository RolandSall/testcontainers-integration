import type { ViteUserConfig } from 'vitest/config';
import type {
  ContainerProjectApplication,
  ContainerProjectContainers,
} from '../container-project.js';
import { serializeContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';

export interface VitestContainerProjectOptions<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> {
  readonly include: readonly string[];
  readonly containers: TContainers;
  readonly application?: string | ContainerProjectApplication<TContainers>;
  readonly hookTimeout?: number;
  readonly testTimeout?: number;
  readonly containerLogs?: boolean;
  readonly vitest?: Omit<
    NonNullable<ViteUserConfig['test']>,
    'include' | 'globalSetup' | 'setupFiles' | 'provide' | 'isolate' | 'sequence'
  >;
}

/** Defines a Vitest project with shared or file-dedicated named containers. */
export const defineContainerProject = <
  const TContainers extends ContainerProjectContainers,
>(options: VitestContainerProjectOptions<TContainers>): ViteUserConfig => {
  if ((options.vitest as { isolate?: unknown } | undefined)?.isolate === false) {
    throw new Error('Vitest isolate: false is not supported with file-dedicated containers');
  }
  const applicationSetup = typeof options.application === 'string'
    ? options.application
    : options.application?.setup;
  const environment = typeof options.application === 'object'
    ? options.application.environment
    : undefined;
  return {
    test: {
      ...options.vitest,
      include: [...options.include],
      globalSetup: ['@integration-testing/testcontainers/vitest/project-global-setup'],
      setupFiles: [
        '@integration-testing/testcontainers/vitest/file-setup',
        ...(applicationSetup === undefined ? [] : [applicationSetup]),
      ],
      sequence: { setupFiles: 'list', hooks: 'stack' },
      isolate: true,
      ...(options.hookTimeout === undefined ? {} : { hookTimeout: options.hookTimeout }),
      ...(options.testTimeout === undefined ? {} : { testTimeout: options.testTimeout }),
      provide: {
        [CONTAINER_PROJECT_CONTEXT_KEY]: serializeContainerProject(
          options.containers,
          environment,
          options.containerLogs,
        ),
      },
    },
  };
};

export const defineVitestContainerProject = defineContainerProject;
