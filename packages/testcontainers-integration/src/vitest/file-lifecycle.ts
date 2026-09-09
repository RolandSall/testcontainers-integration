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

export interface VitestContainerFileSupportOptions {
  readonly registry?: ContainerRegistry;
  readonly prepareResources?: PrepareFileContainerResources;
}

const controller = new IntegrationTestFileController();
let configuredRegistry: ContainerRegistry | undefined;
let prepareResources: PrepareFileContainerResources | undefined;
let hooksInstalled = false;

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
  beforeAll(async () => {
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
    const environment = project?.environment ?? annotation?.environment;
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
      },
      ...(environment === undefined ? {} : { environment }),
      ...(applicationClass === undefined ? {} : { applicationTestClass: applicationClass }),
      startApplication: project === undefined
        ? applicationClass !== undefined
        : controller.applicationIsConfigured(),
      ...(prepareResources === undefined ? {} : { prepareResources }),
    });
  });
  afterAll(async () => controller.stop());
};

export const configureVitestApplication = <TApplication>(
  lifecycle: ApplicationLifecycle<TApplication>,
): ApplicationIntegrationTestContextAccessor<TApplication> =>
  controller.configureApplication(lifecycle);

export const currentVitestContainerResources = () => controller.resources();
