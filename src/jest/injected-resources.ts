import { readFileSync } from 'node:fs';
import type { ContainerResource } from '../container-contract.js';
import { ContainerResources } from '../container-resources.js';
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
  for (const [kind, resource] of Object.entries(parsed)) {
    if (!isContainerResource(resource) || resource.kind !== kind) {
      throw new Error(`Invalid Jest container resource: ${kind}`);
    }
    resources[kind] = resource;
  }
  return ContainerResources.fromSerializable(resources);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isContainerResource = (value: unknown): value is ContainerResource =>
  isRecord(value) && typeof value.kind === 'string';
