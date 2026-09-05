import type { ContainerKind } from '../container-resource-map.js';
import type { ContainerRegistry } from '../container-registry.js';
import type { ContainerResources } from '../container-resources.js';
import { ContainerRuntime } from '../container-runtime.js';
import type { ContainerRuntimeOptions } from '../container-runtime-options.js';
import type { ContainerSource } from './container-source.js';

/** Container source that owns and stops its own `ContainerRuntime`. */
export class OwnedContainerSource implements ContainerSource {
  private readonly runtime: ContainerRuntime;

  /** Creates an owned runtime from a registry and optional runtime adapters. */
  constructor(registry: ContainerRegistry, options: ContainerRuntimeOptions = {}) {
    this.runtime = new ContainerRuntime(registry, options);
  }

  /** Starts required kinds through the owned runtime. */
  start(kinds: readonly ContainerKind[]): Promise<ContainerResources> {
    return this.runtime.start(kinds);
  }

  /** Stops all containers and the network owned by this source. */
  stop(): Promise<void> {
    return this.runtime.stop();
  }
}
