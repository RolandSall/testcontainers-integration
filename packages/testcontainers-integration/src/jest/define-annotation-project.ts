import type { Config } from 'jest';
import type { AnnotationProjectApplication } from '../annotation-project.js';
import { serializeAnnotationProject } from '../annotation-project.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';
import type { IntegrationDashboardConfiguration } from '../dashboard/dashboard-config.js';

export interface JestAnnotationProjectOptions {
  readonly include?: readonly string[];
  readonly application?: string | AnnotationProjectApplication;
  readonly testFileSuffix?: string;
  readonly containerLogs?: boolean;
  readonly dashboard?: IntegrationDashboardConfiguration;
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
  const reporters = dashboardReporters(options.dashboard, options.jest?.reporters);
  return {
    ...options.jest,
    ...(reporters === undefined ? {} : { reporters }),
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

export const defineJestAnnotationProject = defineAnnotationProject;
