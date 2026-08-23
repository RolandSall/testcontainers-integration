/** Runner-neutral wrapper around a concrete container-network handle. */
export interface ContainerNetwork {
  /** Opaque runtime handle consumed by concrete Testcontainers adapters. */
  readonly native: unknown;
  /** Stops and removes the network. */
  stop(): Promise<void>;
}
