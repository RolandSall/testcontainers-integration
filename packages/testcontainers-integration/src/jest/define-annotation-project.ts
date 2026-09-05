import type { Config } from 'jest';
import { serializeAnnotationProject } from '../annotation-project.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';

/** Concise annotation-discovery configuration for a Jest integration project. */
export interface JestAnnotationProjectOptions {
  readonly include?: readonly string[];
  readonly application?: string;
  readonly testFileSuffix?: string;
  /** Streams raw container output. Disabled by default. */
  readonly containerLogs?: boolean;
  /** Runner-specific options such as ts-jest transform configuration. */
  readonly jest?: Omit<
    Config,
    'testMatch' | 'globalSetup' | 'globalTeardown' | 'setupFilesAfterEnv' | 'globals'
  >;
}

/** Defines a complete built-in annotation project without consumer-owned global setup. */
export const defineAnnotationProject = (
  options: JestAnnotationProjectOptions = {},
): Config => ({
  ...options.jest,
  testMatch: [...(options.include ?? ['**/*.container.integration.test.ts'])],
  globalSetup:
    '@integration-testing/testcontainers/jest/annotation-global-setup',
  globalTeardown:
    '@integration-testing/testcontainers/jest/annotation-global-teardown',
  ...(options.application === undefined
    ? {}
    : { setupFilesAfterEnv: [options.application] }),
  globals: {
    [ANNOTATION_PROJECT_CONTEXT_KEY]: serializeAnnotationProject(
      options.testFileSuffix,
      options.containerLogs,
    ),
  },
});

/** Explicit runner-qualified alias for mixed-runner documentation and tooling. */
export const defineJestAnnotationProject = defineAnnotationProject;
