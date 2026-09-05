import type { SerializedContainerProject } from './container-project.js';
import type { SerializedAnnotationProject } from './annotation-project.js';

/** Internal serializable key shared by annotation runner configuration and setup. */
export const ANNOTATION_PROJECT_CONTEXT_KEY = 'integration-testing.testcontainers.annotation-project';

/** Annotation discovery options transported through a runner's project configuration. */
export type AnnotationProjectContext = SerializedAnnotationProject;

/** Internal serializable key shared by the runner configuration and setup modules. */
export const CONTAINER_PROJECT_CONTEXT_KEY = 'integration-testing.testcontainers.project';

/** Value transported through a runner's own project configuration. */
export type ContainerProjectContext = SerializedContainerProject;
