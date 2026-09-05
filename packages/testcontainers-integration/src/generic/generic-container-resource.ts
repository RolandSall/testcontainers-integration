import type { ContainerResource } from '../container-contract.js';

/** Basic connection facts available to custom-image resource factories. */
export interface GenericContainerConnection {
  readonly host: string;
  readonly mappedPorts: Readonly<Record<number, number>>;
}

/** Default resource shape for a custom GenericContainer adapter. */
export interface GenericContainerResource<TKind extends string> extends ContainerResource {
  readonly kind: TKind;
  readonly host: string;
  readonly mappedPorts: Readonly<Record<number, number>>;
}
