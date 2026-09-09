import { inject } from 'vitest';
import type { SerializedAnnotationProject } from '../annotation-project.js';
import type { ContainerResources, SerializableContainerResources } from '../container-resources.js';
import { parseContainerProject, type SerializedContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { currentVitestContainerResources } from './file-lifecycle.js';

declare module 'vitest' {
  export interface ProvidedContext {
    readonly 'integration-testing.testcontainers.resources': SerializableContainerResources;
    readonly 'integration-testing.testcontainers.project': SerializedContainerProject;
    readonly 'integration-testing.testcontainers.annotation-project': SerializedAnnotationProject;
  }
}

/** Returns the combined shared and dedicated resources for the active Vitest file. */
export const injectedContainerResources = (): ContainerResources =>
  currentVitestContainerResources();

/** Reads the explicit project declaration from Vitest context. */
export const injectedContainerProject = (): SerializedContainerProject | undefined => {
  const candidate = inject(CONTAINER_PROJECT_CONTEXT_KEY) as unknown;
  return candidate === undefined ? undefined : parseContainerProject(candidate);
};
