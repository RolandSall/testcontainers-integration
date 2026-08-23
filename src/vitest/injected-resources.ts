import { inject } from 'vitest';
import {
  ContainerResources,
  type SerializableContainerResources,
} from '../container-resources.js';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from './context-key.js';

declare module 'vitest' {
  export interface ProvidedContext {
    readonly 'container-integration-testing.resources': SerializableContainerResources;
  }
}

/** Reads serializable resources provided by global setup and restores typed lookup. */
export const injectedContainerResources = (): ContainerResources =>
  ContainerResources.fromSerializable(inject(CONTAINER_RESOURCES_CONTEXT_KEY));
