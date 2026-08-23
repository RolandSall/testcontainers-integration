import type { ContainerKind } from '../container-resource-map.js';
import type { ContainerResources } from '../container-resources.js';

/** Supplies container resources either by owning a runtime or by reusing provided data. */
export interface ContainerSource {
  /** Returns resources for all requested kinds. */
  start(kinds: readonly ContainerKind[]): Promise<ContainerResources>;
  /** Releases resources owned by this source. */
  stop(): Promise<void>;
}
