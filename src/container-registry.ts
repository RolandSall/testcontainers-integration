import type { ContainerResource } from './container-contract.js';
import type { Container } from './container-kind.js';
import type { ContainerKind, ContainerResourceMap } from './container-resource-map.js';

type UntypedContainerFactory = () => Container<ContainerResource>;

/** Maps logical container kinds to factories for their concrete adapters. */
export class ContainerRegistry {
  private readonly factories = new Map<string, UntypedContainerFactory>();

  /**
   * Registers one factory for a container kind.
   *
   * @throws When the kind already has a registered factory.
   */
  register<TKind extends ContainerKind>(
    kind: TKind,
    factory: () => Container<ContainerResourceMap[TKind]>,
  ): this {
    if (this.factories.has(kind)) {
      throw new Error(`Container kind is already registered: ${kind}`);
    }
    this.factories.set(kind, factory);
    return this;
  }

  /**
   * Creates a new container adapter for the requested kind.
   *
   * @throws When no factory is registered for the kind.
   */
  create<TKind extends ContainerKind>(
    kind: TKind,
  ): Container<ContainerResourceMap[TKind]> {
    const factory = this.factories.get(kind);
    if (factory === undefined) {
      throw new Error(`Container kind is not registered: ${kind}`);
    }
    return factory() as Container<ContainerResourceMap[TKind]>;
  }
}
