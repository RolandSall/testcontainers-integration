import type { Config } from 'jest';
import { parseAnnotationProject } from '../annotation-project.js';
import { createDefaultContainerRegistry } from '../default-container-registry.js';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';
import {
  createJestContainerGlobalSetup,
  type JestContainerGlobalSetup,
} from './global-setup.js';

interface JestProjectConfig {
  readonly rootDir: string;
  readonly globals: Config['globals'];
}

export const createConfiguredJestAnnotationLifecycle = (
  projectConfig: JestProjectConfig,
): JestContainerGlobalSetup => {
  const globals = projectConfig.globals ?? {};
  const annotationProject = parseAnnotationProject(
    globals[ANNOTATION_PROJECT_CONTEXT_KEY],
  );
  return createJestContainerGlobalSetup({
    root: projectConfig.rootDir,
    registry: createDefaultContainerRegistry(),
    ...(annotationProject.testFileSuffix === undefined
      ? {}
      : { testFileSuffix: annotationProject.testFileSuffix }),
    ...(annotationProject.containerLogs === undefined
      ? {}
      : { containerLogs: annotationProject.containerLogs }),
  });
};
