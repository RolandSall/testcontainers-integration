import type { SerializedContainerProject } from './container-project.js';

/** Internal serializable key shared by the runner configuration and setup modules. */
export const CONTAINER_PROJECT_CONTEXT_KEY = 'integration-testing.testcontainers.project';

/** Value transported through a runner's own project configuration. */
export type ContainerProjectContext = SerializedContainerProject;
