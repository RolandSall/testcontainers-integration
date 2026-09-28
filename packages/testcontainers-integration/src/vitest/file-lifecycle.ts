import { afterAll, beforeAll, inject } from 'vitest';
import { parseAnnotationProject } from '../annotation-project.js';
import { consumeApplicationIntegrationTestClass } from '../application-integration-test.js';
import { createContainerProjectRegistry, parseContainerProject } from '../container-project.js';
import type { ContainerRegistry } from '../container-registry.js';
import { createDefaultContainerRegistry } from '../default-container-registry.js';
import type { ApplicationIntegrationTestContextAccessor } from '../environment/application-integration-test-context-accessor.js';
import type { ApplicationLifecycle } from '../environment/application-lifecycle.js';
import { IntegrationTestFileController } from '../integration-test-file-controller.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY, CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import {
  consumeRequiredContainerClass,
  requiredContainersFor,
} from '../required-container.js';
import type { PrepareFileContainerResources } from '../container-file-context.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
import { restoreProvidedContainerResources } from './provided-container-resources.js';
import { dashboardEventSinkFor, flushDashboardEvents } from '../dashboard/dashboard-context.js';
import { DashboardIntegrationTestLogger } from '../dashboard/dashboard-logger.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import { dashboardErrorMessage } from '../dashboard/dashboard-event.js';

export interface VitestContainerFileSupportOptions {
  readonly registry?: ContainerRegistry;
  readonly prepareResources?: PrepareFileContainerResources;
}

const controller = new IntegrationTestFileController();
let configuredRegistry: ContainerRegistry | undefined;
let prepareResources: PrepareFileContainerResources | undefined;
let hooksInstalled = false;
let activeFilePath: string | undefined;

/** Configures advanced file-owned containers, including custom container registries. */
export const configureVitestContainerFileSupport = (
  options: VitestContainerFileSupportOptions,
): void => {
  configuredRegistry = options.registry;
  prepareResources = options.prepareResources;
};

/** Registers the package-owned file hooks. Called by the generated runner setup. */
export const installVitestContainerFileSupport = (): void => {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // Vitest requires fixture-style destructuring even when this package needs no fixtures.
  // eslint-disable-next-line no-empty-pattern
  beforeAll(async ({}, suite) => {
    activeFilePath = suite.file.filepath;
    const eventSink = dashboardEventSinkFor(activeFilePath);
    const startedAt = Date.now();
    eventSink?.emit({
      type: 'file.lifecycle-starting', status: 'starting', scope: 'file',
      message: 'starting test file lifecycle', filePath: activeFilePath,
    });
    const projectValue = inject(CONTAINER_PROJECT_CONTEXT_KEY) as unknown;
    const project = projectValue === undefined ? undefined : parseContainerProject(projectValue);
    const requiredClass = consumeRequiredContainerClass();
    const applicationClass = consumeApplicationIntegrationTestClass();
    if (applicationClass !== undefined && requiredClass !== applicationClass) {
      throw new Error('@ApplicationIntegrationTest and @RequiredContainer must decorate the same class');
    }
    const annotationValue = inject(ANNOTATION_PROJECT_CONTEXT_KEY) as unknown;
    const annotation = project === undefined
      ? parseAnnotationProject(annotationValue ?? { version: 2 })
      : undefined;
    const declarations = project === undefined
      ? requiredClass === undefined ? [] : requiredContainersFor(requiredClass)
      : project.containers;
    for (const declaration of declarations) {
      eventSink?.emit({
        type: 'file.container-declared', status: 'ready', scope: 'file',
        message: `${declaration.name} declared for test file`, filePath: activeFilePath,
        containerName: declaration.name, containerKind: declaration.kind,
        isolation: declaration.isolation,
      });
    }
    const environment = project?.environment ?? annotation?.environment;
    try {
      await controller.start({
        declarations,
      sharedResources: restoreProvidedContainerResources(
        inject(CONTAINER_RESOURCES_CONTEXT_KEY),
      ),
      registry: project === undefined
        ? configuredRegistry ?? createDefaultContainerRegistry()
        : createContainerProjectRegistry(project),
      runtimeOptions: {
        ...((project?.containerLogs ?? annotation?.containerLogs) === true
          ? { containerLogs: true }
          : {}),
        ...(eventSink === undefined ? {} : {
          eventSink,
          eventContext: { isolation: 'dedicated', filePath: activeFilePath },
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
        message: 'test file lifecycle is ready', filePath: activeFilePath,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      eventSink?.emit({
        type: 'file.lifecycle-failed', status: 'failed', scope: 'file',
        message: 'test file lifecycle failed to start', filePath: activeFilePath,
        durationMs: Date.now() - startedAt, error: dashboardErrorMessage(error),
      });
      await flushDashboardEvents();
      throw error;
    }
  });
  afterAll(async () => {
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

export const configureVitestApplication = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> =>
  controller.configureApplication(lifecycle);

export const currentVitestContainerResources = () => controller.resources();
