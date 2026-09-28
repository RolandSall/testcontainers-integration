import { readFileSync } from 'node:fs';
import { parseAnnotationProject } from '../annotation-project.js';
import { consumeApplicationIntegrationTestClass } from '../application-integration-test.js';
import { createContainerProjectRegistry, parseContainerProject } from '../container-project.js';
import type { ContainerRegistry } from '../container-registry.js';
import { ContainerResources } from '../container-resources.js';
import type { PrepareFileContainerResources } from '../container-file-context.js';
import { createDefaultContainerRegistry } from '../default-container-registry.js';
import type { ApplicationIntegrationTestContextAccessor } from '../environment/application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from '../environment/application-lifecycle.js';
import { IntegrationTestFileController } from '../integration-test-file-controller.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY, CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import {
  consumeRequiredContainerClass,
  requiredContainersFor,
} from '../required-container.js';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from './context-key.js';
import { dashboardEventSinkFor, flushDashboardEvents } from '../dashboard/dashboard-context.js';
import { DashboardIntegrationTestLogger } from '../dashboard/dashboard-logger.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import { dashboardErrorMessage } from '../dashboard/dashboard-event.js';

export interface JestContainerFileSupportOptions {
  readonly registry?: ContainerRegistry;
  readonly prepareResources?: PrepareFileContainerResources;
}

const controller = new IntegrationTestFileController();
let configuredRegistry: ContainerRegistry | undefined;
let prepareResources: PrepareFileContainerResources | undefined;
let hooksInstalled = false;
let activeFilePath: string | undefined;

/** Configures advanced file-owned containers, including custom container registries. */
export const configureJestContainerFileSupport = (
  options: JestContainerFileSupportOptions,
): void => {
  configuredRegistry = options.registry;
  prepareResources = options.prepareResources;
};

/** Registers the package-owned file hooks. Called by the generated runner setup. */
export const installJestContainerFileSupport = (): void => {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const hooks = jestHooks();
  hooks.beforeAll(async () => {
    activeFilePath = currentJestTestPath();
    const eventSink = dashboardEventSinkFor(activeFilePath);
    const startedAt = Date.now();
    eventSink?.emit({
      type: 'file.lifecycle-starting', status: 'starting', scope: 'file',
      message: 'starting test file lifecycle',
      ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
    });
    const projectValue = (globalThis as Record<string, unknown>)[CONTAINER_PROJECT_CONTEXT_KEY];
    const project = projectValue === undefined ? undefined : parseContainerProject(projectValue);
    const requiredClass = consumeRequiredContainerClass();
    const applicationClass = consumeApplicationIntegrationTestClass();
    if (applicationClass !== undefined && requiredClass !== applicationClass) {
      throw new Error('@ApplicationIntegrationTest and @RequiredContainer must decorate the same class');
    }
    const annotationValue = (globalThis as Record<string, unknown>)[ANNOTATION_PROJECT_CONTEXT_KEY];
    const annotation = project === undefined
      ? parseAnnotationProject(annotationValue ?? { version: 2 })
      : undefined;
    const declarations = project === undefined
      ? requiredClass === undefined ? [] : requiredContainersFor(requiredClass)
      : project.containers;
    for (const declaration of declarations) {
      eventSink?.emit({
        type: 'file.container-declared', status: 'ready', scope: 'file',
        message: `${declaration.name} declared for test file`,
        ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
        containerName: declaration.name, containerKind: declaration.kind,
        isolation: declaration.isolation,
      });
    }
    const environment = project?.environment ?? annotation?.environment;
    try {
      await controller.start({
        declarations,
      sharedResources: readSharedResources(),
      registry: project === undefined
        ? configuredRegistry ?? createDefaultContainerRegistry()
        : createContainerProjectRegistry(project),
      runtimeOptions: {
        ...((project?.containerLogs ?? annotation?.containerLogs) === true
          ? { containerLogs: true }
          : {}),
        ...(eventSink === undefined ? {} : {
          eventSink,
          eventContext: {
            isolation: 'dedicated',
            ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
          },
          logger: new DashboardIntegrationTestLogger(
            consoleIntegrationTestLogger,
            eventSink,
            activeFilePath,
          ),
        }),
      },
      ...(environment === undefined ? {} : { environment }),
      ...(applicationClass === undefined ? {} : { applicationTestClass: applicationClass }),
      startApplication: project === undefined
        ? applicationClass !== undefined
        : controller.applicationIsConfigured(),
        ...(prepareResources === undefined ? {} : { prepareResources }),
      });
      eventSink?.emit({
        type: 'file.lifecycle-ready', status: 'ready', scope: 'file',
        message: 'test file lifecycle is ready',
        ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      eventSink?.emit({
        type: 'file.lifecycle-failed', status: 'failed', scope: 'file',
        message: 'test file lifecycle failed to start',
        ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
        durationMs: Date.now() - startedAt, error: dashboardErrorMessage(error),
      });
      await flushDashboardEvents();
      throw error;
    }
  });
  hooks.afterAll(async () => {
    const eventSink = dashboardEventSinkFor(activeFilePath);
    const startedAt = Date.now();
    try {
      await controller.stop();
      eventSink?.emit({
        type: 'file.lifecycle-stopped', status: 'stopped', scope: 'file',
        message: 'test file lifecycle stopped',
        ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      eventSink?.emit({
        type: 'file.lifecycle-stop-failed', status: 'failed', scope: 'file',
        message: 'test file lifecycle failed to stop',
        ...(activeFilePath === undefined ? {} : { filePath: activeFilePath }),
        durationMs: Date.now() - startedAt, error: dashboardErrorMessage(error),
      });
      throw error;
    } finally {
      await flushDashboardEvents();
    }
  });
};

export const configureJestApplication = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> =>
  controller.configureApplication(lifecycle);

export const currentJestContainerResources = () => controller.resources();

const readSharedResources = (): ContainerResources => {
  const resourcePath = process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
  if (resourcePath === undefined) {
    throw new Error('Jest shared container resources were not provided by global setup');
  }
  const value: unknown = JSON.parse(readFileSync(resourcePath, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Jest shared container resources are invalid');
  }
  return ContainerResources.fromSerializable(value as Record<string, never>);
};

interface JestHooks {
  beforeAll(action: () => Promise<void>): void;
  afterAll(action: () => Promise<void>): void;
}

const jestHooks = (): JestHooks => {
  const candidate = globalThis as typeof globalThis & Partial<JestHooks>;
  if (typeof candidate.beforeAll !== 'function' || typeof candidate.afterAll !== 'function') {
    throw new Error('Jest container file support must be installed through setupFilesAfterEnv');
  }
  return {
    beforeAll: candidate.beforeAll.bind(candidate),
    afterAll: candidate.afterAll.bind(candidate),
  };
};

const currentJestTestPath = (): string | undefined => {
  const candidate = globalThis as typeof globalThis & {
    expect?: { getState?: () => { testPath?: string } };
  };
  return candidate.expect?.getState?.().testPath;
};
