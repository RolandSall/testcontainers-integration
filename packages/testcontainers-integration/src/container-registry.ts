import type { ContainerResource } from './container-contract.js';
import type { Container } from './container-kind.js';
import type { ContainerKind, ContainerResourceMap } from './container-resource-map.js';

type UntypedContainerFactory = () => Container<ContainerResource>;

interface NamedContainerFactory {
  readonly kind: ContainerKind;
  readonly factory: UntypedContainerFactory;
}

/** Maps logical container kinds to factories for their concrete adapters. */
export class ContainerRegistry {
  private readonly factories = new Map<string, UntypedContainerFactory>();
  private readonly namedFactories = new Map<string, NamedContainerFactory>();

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

  /** Registers a factory for one named container instance in an explicit project. */
  registerInstance(
    name: string,
    kind: ContainerKind,
    factory: UntypedContainerFactory,
    defaultForKind = false,
  ): this {
    if (this.namedFactories.has(name)) {
      throw new Error(`Container instance is already registered: ${name}`);
    }
    this.namedFactories.set(name, { kind, factory });
    if (defaultForKind) {
      this.factories.set(kind, factory);
    }
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


  /** Creates a configured named instance and verifies its declared kind. */
  createInstance<TKind extends ContainerKind>(
    name: string,
    kind: TKind,
  ): Container<ContainerResourceMap[TKind]> {
    const registration = this.namedFactories.get(name);
    if (registration === undefined) {
      return this.create(kind);
    }
    if (registration.kind !== kind) {
      throw new Error(
        `Container instance ${name} is registered as ${registration.kind}, not ${kind}`,
      );
    }
    return registration.factory() as Container<ContainerResourceMap[TKind]>;
  }
}
