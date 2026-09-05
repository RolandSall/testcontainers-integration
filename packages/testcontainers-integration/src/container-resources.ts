import type { ContainerResource } from './container-contract.js';
import type { ContainerKind, ContainerResourceMap } from './container-resource-map.js';

/** Serializable resource collection used across test-runner process boundaries. */
export type SerializableContainerResources = Readonly<Record<string, ContainerResource>>;

/** Typed lookup over the resources returned by started containers. */
export class ContainerResources {
  private readonly resources: ReadonlyMap<string, ContainerResource>;

  /** Creates a collection from started container resources. */
  constructor(
    resources: Iterable<ContainerResource>,
    names?: Iterable<string>,
  ) {
    const values = [...resources];
    const keys = names === undefined ? values.map(({ kind }) => kind) : [...names];
    if (keys.length !== values.length) {
      throw new Error('Container resource names and values must have the same length');
    }
    this.resources = new Map(
      values.map((resource, index) => {
        const key = keys[index];
        if (key === undefined) {
          throw new Error('Container resource name is missing');
        }
        return [key, resource] as const;
      }),
    );
  }

  /** Creates a collection whose keys identify named container instances. */
  static fromNamed(
    resources: Iterable<readonly [string, ContainerResource]>,
  ): ContainerResources {
    const entries = [...resources];
    return new ContainerResources(
      entries.map(([, resource]) => resource),
      entries.map(([name]) => name),
    );
  }

  /** Reconstructs the typed lookup after a test runner transfers plain data. */
  static fromSerializable(resources: SerializableContainerResources): ContainerResources {
    return ContainerResources.fromNamed(Object.entries(resources));
  }

  /**
   * Returns the resource associated with a container kind.
   *
   * @throws When the requested resource was not started or provided.
   */
  get<TKind extends ContainerKind>(kind: TKind): ContainerResourceMap[TKind] {
    const matches = [...this.resources.values()].filter(
      (resource) => resource.kind === kind,
    );
    if (matches.length === 0) {
      throw new Error(`Container resource is not available: ${kind}`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple ${kind} resources are available; use resources.getNamed(name, kind)`,
      );
    }
    return matches[0] as ContainerResourceMap[TKind];
  }

  /** Returns one named resource and verifies that it has the expected kind. */
  getNamed<TKind extends ContainerKind>(
    name: string,
    kind: TKind,
  ): ContainerResourceMap[TKind] {
    const resource = this.resources.get(name);
    if (resource === undefined) {
      throw new Error(`Named container resource is not available: ${name}`);
    }
    if (resource.kind !== kind) {
      throw new Error(`Named container resource ${name} has kind ${resource.kind}, not ${kind}`);
    }
    return resource as ContainerResourceMap[TKind];
  }

  /** Reports whether a resource exists for the requested kind. */
  has(kind: ContainerKind): boolean {
    return [...this.resources.values()].some((resource) => resource.kind === kind);
  }

  /** Returns the kinds available in this resource collection. */
  kinds(): readonly ContainerKind[] {
    return [...new Set(
      [...this.resources.values()].map((resource) => resource.kind as ContainerKind),
    )];
  }

  /** Converts the collection to plain data suitable for Vitest `provide()`. */
  toSerializable(): SerializableContainerResources {
    return Object.fromEntries(this.resources);
  }
}
