import {
  containerProjectInstances,
  createContainerProjectRegistry,
  parseContainerProject,
} from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import {
  createVitestContainerGlobalSetup,
  type VitestContainerGlobalSetup,
  type VitestGlobalSetupProject,
} from './global-setup.js';

interface ConfiguredVitestProject extends VitestGlobalSetupProject {
  readonly config: Readonly<{ root: string }>;
  getProvidedContext(): Readonly<Record<string, unknown>>;
}

let lifecycle: VitestContainerGlobalSetup | undefined;

export const setup = async (project: ConfiguredVitestProject): Promise<void> => {
  const containerProject = parseContainerProject(
    project.getProvidedContext()[CONTAINER_PROJECT_CONTEXT_KEY],
  );
  lifecycle = createVitestContainerGlobalSetup({
    root: project.config.root,
    registry: createContainerProjectRegistry(containerProject),
    requiredContainerInstances: containerProjectInstances(containerProject, 'shared'),
    ...(containerProject.containerLogs === undefined
      ? {}
      : { containerLogs: containerProject.containerLogs }),
  });
  await lifecycle.setup(project);
};

export const teardown = async (): Promise<void> => {
  const activeLifecycle = lifecycle;
  lifecycle = undefined;
  await activeLifecycle?.teardown();
};
