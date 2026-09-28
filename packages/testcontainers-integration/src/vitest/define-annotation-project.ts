import type { ViteUserConfig } from 'vitest/config';
import type { AnnotationProjectApplication } from '../annotation-project.js';
import { serializeAnnotationProject } from '../annotation-project.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';
import type { IntegrationDashboardConfiguration } from '../dashboard/dashboard-config.js';

export interface VitestAnnotationProjectOptions {
  readonly include?: readonly string[];
  readonly application?: string | AnnotationProjectApplication;
  readonly testFileSuffix?: string;
  readonly hookTimeout?: number;
  readonly testTimeout?: number;
  readonly containerLogs?: boolean;
  readonly dashboard?: IntegrationDashboardConfiguration;
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
  const reporters = dashboardReporters(options.dashboard, options.vitest?.reporters);
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
      ...(reporters === undefined ? {} : { reporters }),
      provide: {
        [ANNOTATION_PROJECT_CONTEXT_KEY]: serializeAnnotationProject(
          options.testFileSuffix,
          options.containerLogs,
          environment,
          options.dashboard,
        ),
      },
    },
  };
};

const dashboardReporters = (
  dashboard: IntegrationDashboardConfiguration | undefined,
  reporters: NonNullable<ViteUserConfig['test']>['reporters'],
): NonNullable<ViteUserConfig['test']>['reporters'] => {
  if (dashboard === undefined || dashboard === false) return reporters;
  if (reporters === undefined) {
    return ['default', '@integration-testing/testcontainers/vitest/dashboard-reporter'];
  }
  const configured = isReporterWithOptions(reporters)
    ? [reporters]
    : Array.isArray(reporters) ? reporters : [reporters];
  return [
    ...configured,
    '@integration-testing/testcontainers/vitest/dashboard-reporter',
  ] as NonNullable<ViteUserConfig['test']>['reporters'];
};

const isReporterWithOptions = (value: unknown): value is readonly [string, object] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'object' &&
  value[1] !== null &&
  !Array.isArray(value[1]);

export const defineVitestAnnotationProject = defineAnnotationProject;
