import type { Config } from 'jest';
import {
  containerProjectInstances,
  createContainerProjectRegistry,
  parseContainerProject,
} from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import {
  createJestContainerGlobalSetup,
  type JestContainerGlobalSetup,
} from './global-setup.js';

interface JestProjectConfig {
  readonly rootDir: string;
  readonly globals: Config['globals'];
}

export const createConfiguredJestLifecycle = (
  projectConfig: JestProjectConfig,
): JestContainerGlobalSetup => {
  const globals = projectConfig.globals ?? {};
  const containerProject = parseContainerProject(
    globals[CONTAINER_PROJECT_CONTEXT_KEY],
  );
  return createJestContainerGlobalSetup({
    root: projectConfig.rootDir,
    registry: createContainerProjectRegistry(containerProject),
    requiredContainerInstances: containerProjectInstances(containerProject, 'shared'),
    ...(containerProject.containerLogs === undefined
      ? {}
      : { containerLogs: containerProject.containerLogs }),
  });
};
