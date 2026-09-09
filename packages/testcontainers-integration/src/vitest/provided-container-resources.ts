import type { ContainerResource } from '../container-contract.js';
import { ContainerResources } from '../container-resources.js';
import type { SerializableContainerResources } from '../container-resources.js';

/** Validates and restores globally shared resources received from Vitest setup. */
export const restoreProvidedContainerResources = (
  provided: unknown,
): ContainerResources => ContainerResources.fromSerializable(parseResources(provided));

const parseResources = (value: unknown): SerializableContainerResources => {
  if (!isRecord(value)) {
    throw new Error(
      'Vitest container resources were not provided. Configure the integration project global setup.',
    );
  }
  const resources: Record<string, ContainerResource> = {};
  for (const [name, resource] of Object.entries(value)) {
    if (!isRecord(resource) || typeof resource.kind !== 'string') {
      throw new Error(`Invalid Vitest container resource: ${name}`);
    }
    resources[name] = resource as unknown as ContainerResource;
  }
  return resources;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
