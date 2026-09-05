import type { ViteUserConfig } from 'vitest/config';
import { serializeAnnotationProject } from '../annotation-project.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';

/** Concise annotation-discovery configuration for a Vitest integration project. */
export interface VitestAnnotationProjectOptions {
  readonly include?: readonly string[];
  readonly application?: string;
  readonly testFileSuffix?: string;
  readonly hookTimeout?: number;
  readonly testTimeout?: number;
  /** Streams raw container output. Disabled by default. */
  readonly containerLogs?: boolean;
}

/** Defines a complete built-in annotation project without consumer-owned global setup. */
export const defineAnnotationProject = (
  options: VitestAnnotationProjectOptions = {},
): ViteUserConfig => ({
  test: {
    include: [...(options.include ?? ['**/*.container.integration.test.ts'])],
    globalSetup: [
      '@integration-testing/testcontainers/vitest/annotation-global-setup',
    ],
    ...(options.application === undefined
      ? {}
      : { setupFiles: [options.application] }),
    ...(options.hookTimeout === undefined
      ? {}
      : { hookTimeout: options.hookTimeout }),
    ...(options.testTimeout === undefined
      ? {}
      : { testTimeout: options.testTimeout }),
    provide: {
      [ANNOTATION_PROJECT_CONTEXT_KEY]: serializeAnnotationProject(
        options.testFileSuffix,
        options.containerLogs,
      ),
    },
  },
});

/** Explicit runner-qualified alias for mixed-runner documentation and tooling. */
export const defineVitestAnnotationProject = defineAnnotationProject;
