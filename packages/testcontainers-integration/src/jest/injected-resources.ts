import type { ContainerResources } from '../container-resources.js';
import { parseContainerProject, type SerializedContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { currentJestContainerResources } from './file-lifecycle.js';

/** Returns the combined shared and dedicated resources for the active Jest file. */
export const injectedContainerResources = (): ContainerResources =>
  currentJestContainerResources();

/** Reads the explicit project declaration from Jest globals. */
export const injectedContainerProject = (): SerializedContainerProject | undefined => {
  const candidate = (globalThis as Record<string, unknown>)[CONTAINER_PROJECT_CONTEXT_KEY];
  return candidate === undefined ? undefined : parseContainerProject(candidate);
};
