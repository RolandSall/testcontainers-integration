import type { Config } from 'jest';
import type { AnnotationProjectApplication } from '../annotation-project.js';
import { serializeAnnotationProject } from '../annotation-project.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';

export interface JestAnnotationProjectOptions {
  readonly include?: readonly string[];
  readonly application?: string | AnnotationProjectApplication;
  readonly testFileSuffix?: string;
  readonly containerLogs?: boolean;
  readonly jest?: Omit<
    Config,
    'testMatch' | 'globalSetup' | 'globalTeardown' | 'setupFilesAfterEnv' | 'globals'
  >;
}

/** Defines a Jest annotation project with per-container file isolation. */
export const defineAnnotationProject = (
  options: JestAnnotationProjectOptions = {},
): Config => {
  const applicationSetup = typeof options.application === 'string'
    ? options.application
    : options.application?.setup;
  const environment = typeof options.application === 'object'
    ? options.application.environment
    : undefined;
  return {
    ...options.jest,
    testMatch: [...(options.include ?? ['**/*.container.integration.test.ts'])],
    globalSetup: '@integration-testing/testcontainers/jest/annotation-global-setup',
    globalTeardown: '@integration-testing/testcontainers/jest/annotation-global-teardown',
    setupFilesAfterEnv: [
      '@integration-testing/testcontainers/jest/file-setup',
      ...(applicationSetup === undefined ? [] : [applicationSetup]),
    ],
    globals: {
      [ANNOTATION_PROJECT_CONTEXT_KEY]: serializeAnnotationProject(
        options.testFileSuffix,
        options.containerLogs,
        environment,
      ),
    },
  };
};

export const defineJestAnnotationProject = defineAnnotationProject;
