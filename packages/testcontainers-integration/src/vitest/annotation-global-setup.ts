import { parseAnnotationProject } from '../annotation-project.js';
import { createDefaultContainerRegistry } from '../default-container-registry.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';
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
  const annotationProject = parseAnnotationProject(
    project.getProvidedContext()[ANNOTATION_PROJECT_CONTEXT_KEY],
  );
  lifecycle = createVitestContainerGlobalSetup({
    root: project.config.root,
    registry: createDefaultContainerRegistry(),
    ...(annotationProject.testFileSuffix === undefined
      ? {}
      : { testFileSuffix: annotationProject.testFileSuffix }),
    ...(annotationProject.containerLogs === undefined
      ? {}
      : { containerLogs: annotationProject.containerLogs }),
  });
  await lifecycle.setup(project);
};

export const teardown = async (): Promise<void> => {
  const activeLifecycle = lifecycle;
  lifecycle = undefined;
  await activeLifecycle?.teardown();
};
