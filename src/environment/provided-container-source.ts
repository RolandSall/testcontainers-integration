import type { ContainerKind } from '../container-resource-map.js';
import type { ContainerResources } from '../container-resources.js';
import type { ContainerSource } from './container-source.js';

/**
 * Container source that validates and reuses resources started by another owner.
 *
 * Its `stop()` is intentionally a no-op so the original owner performs teardown once.
 */
export class ProvidedContainerSource implements ContainerSource {
  /** Wraps resources supplied through a test runner or another environment. */
  constructor(private readonly resources: ContainerResources) {}

  /** Returns the provided resources after validating every requested kind exists. */
  start(kinds: readonly ContainerKind[]): Promise<ContainerResources> {
    for (const kind of kinds) {
      if (!this.resources.has(kind)) {
        return Promise.reject(
          new Error(`Provided container resource is not available: ${kind}`),
        );
      }
    }
    return Promise.resolve(this.resources);
  }

  /** Performs no cleanup because this source does not own the resources. */
  stop(): Promise<void> {
    return Promise.resolve();
  }
}
