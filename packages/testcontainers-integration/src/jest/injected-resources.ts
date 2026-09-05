import { readFileSync } from 'node:fs';
import type { ContainerResource } from '../container-contract.js';
import { ContainerResources } from '../container-resources.js';
import { parseContainerProject, type SerializedContainerProject } from '../container-project.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from './context-key.js';

/** Restores resources written by Jest global setup for the current test worker. */
export const injectedContainerResources = (): ContainerResources => {
  const resourcePath = process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
  if (resourcePath === undefined || resourcePath.length === 0) {
    throw new Error(
      'Jest container resources were not provided. Configure container global setup first.',
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(resourcePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('Jest container resource document must contain an object');
  }
  const resources: Record<string, ContainerResource> = {};
  for (const [name, resource] of Object.entries(parsed)) {
    if (!isContainerResource(resource)) {
      throw new Error(`Invalid Jest container resource: ${name}`);
    }
    resources[name] = resource;
  }
  return ContainerResources.fromSerializable(resources);
};

/** Reads the explicit project declaration injected through Jest `globals`. */
export const injectedContainerProject = (): SerializedContainerProject | undefined => {
  const candidate = (globalThis as Record<string, unknown>)[CONTAINER_PROJECT_CONTEXT_KEY];
  return candidate === undefined ? undefined : parseContainerProject(candidate);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isContainerResource = (value: unknown): value is ContainerResource =>
  isRecord(value) && typeof value.kind === 'string';
