import type { ContainerResource } from './container-contract.js';
import type { ContainerKind, ContainerResourceMap } from './container-resource-map.js';

/** Serializable resource collection used across test-runner process boundaries. */
export type SerializableContainerResources = Readonly<Record<string, ContainerResource>>;

/** Typed lookup over the resources returned by started containers. */
export class ContainerResources {
  private readonly resources: ReadonlyMap<string, ContainerResource>;

  /** Creates a collection from started container resources. */
  constructor(resources: Iterable<ContainerResource>) {
    this.resources = new Map(
      Array.from(resources, (resource) => [resource.kind, resource] as const),
    );
  }

  /** Reconstructs the typed lookup after a test runner transfers plain data. */
  static fromSerializable(resources: SerializableContainerResources): ContainerResources {
    return new ContainerResources(Object.values(resources));
  }

  /**
   * Returns the resource associated with a container kind.
   *
   * @throws When the requested resource was not started or provided.
   */
  get<TKind extends ContainerKind>(kind: TKind): ContainerResourceMap[TKind] {
    const resource = this.resources.get(kind);
    if (resource === undefined) {
      throw new Error(`Container resource is not available: ${kind}`);
    }
    return resource as ContainerResourceMap[TKind];
  }

  /** Reports whether a resource exists for the requested kind. */
  has(kind: ContainerKind): boolean {
    return this.resources.has(kind);
  }

  /** Converts the collection to plain data suitable for Vitest `provide()`. */
  toSerializable(): SerializableContainerResources {
    return Object.fromEntries(this.resources);
  }
}
