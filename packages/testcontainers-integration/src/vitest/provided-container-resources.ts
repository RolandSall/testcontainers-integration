import type { ContainerResource } from '../container-contract.js';
import { ContainerResources } from '../container-resources.js';

/** Validates and restores container resources received from Vitest global setup. */
export const restoreProvidedContainerResources = (
  provided: unknown,
): ContainerResources => {
  if (!isRecord(provided)) {
    throw new Error(
      'Vitest container resources were not provided. Run this test with the integration Vitest config and register createVitestContainerGlobalSetup(...) in test.globalSetup.',
    );
  }

  const resources: Record<string, ContainerResource> = {};
  for (const [name, resource] of Object.entries(provided)) {
    if (!isContainerResource(resource)) {
      throw new Error(`Invalid Vitest container resource: ${name}`);
    }
    resources[name] = resource;
  }
  return ContainerResources.fromSerializable(resources);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isContainerResource = (value: unknown): value is ContainerResource =>
  isRecord(value) && typeof value.kind === 'string';
