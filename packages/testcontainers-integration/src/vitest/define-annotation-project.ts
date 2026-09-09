import type { ViteUserConfig } from 'vitest/config';
import type { AnnotationProjectApplication } from '../annotation-project.js';
import { serializeAnnotationProject } from '../annotation-project.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';

export interface VitestAnnotationProjectOptions {
  readonly include?: readonly string[];
  readonly application?: string | AnnotationProjectApplication;
  readonly testFileSuffix?: string;
  readonly hookTimeout?: number;
  readonly testTimeout?: number;
  readonly containerLogs?: boolean;
  readonly vitest?: Omit<
    NonNullable<ViteUserConfig['test']>,
    'include' | 'globalSetup' | 'setupFiles' | 'provide' | 'isolate' | 'sequence'
  >;
}

/** Defines a Vitest annotation project with per-container file isolation. */
export const defineAnnotationProject = (
  options: VitestAnnotationProjectOptions = {},
): ViteUserConfig => {
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
      include: [...(options.include ?? ['**/*.container.integration.test.ts'])],
      globalSetup: ['@integration-testing/testcontainers/vitest/annotation-global-setup'],
      setupFiles: [
        '@integration-testing/testcontainers/vitest/file-setup',
        ...(applicationSetup === undefined ? [] : [applicationSetup]),
      ],
      sequence: { setupFiles: 'list', hooks: 'stack' },
      isolate: true,
      ...(options.hookTimeout === undefined ? {} : { hookTimeout: options.hookTimeout }),
      ...(options.testTimeout === undefined ? {} : { testTimeout: options.testTimeout }),
      provide: {
        [ANNOTATION_PROJECT_CONTEXT_KEY]: serializeAnnotationProject(
          options.testFileSuffix,
          options.containerLogs,
          environment,
        ),
      },
    },
  };
};

export const defineVitestAnnotationProject = defineAnnotationProject;
