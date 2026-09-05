import { inject } from 'vitest';
import type { ContainerResources, SerializableContainerResources } from '../container-resources.js';
import { parseContainerProject, type SerializedContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';
import { restoreProvidedContainerResources } from './provided-container-resources.js';

declare module 'vitest' {
  export interface ProvidedContext {
    readonly 'integration-testing.testcontainers.resources': SerializableContainerResources;
    readonly 'integration-testing.testcontainers.project': SerializedContainerProject;
  }
}

/** Reads serializable resources provided by global setup and restores typed lookup. */
export const injectedContainerResources = (): ContainerResources =>
  restoreProvidedContainerResources(inject(CONTAINER_RESOURCES_CONTEXT_KEY));

/** Reads the explicit project declaration transported by Vitest configuration. */
export const injectedContainerProject = (): SerializedContainerProject | undefined => {
  const candidate: unknown = inject(CONTAINER_PROJECT_CONTEXT_KEY);
  return candidate === undefined ? undefined : parseContainerProject(candidate);
};
