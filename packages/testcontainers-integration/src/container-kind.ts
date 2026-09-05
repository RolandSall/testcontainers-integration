import type { ContainerResource } from './container-contract.js';
import type { ContainerStartOptions } from './container-start-options.js';

/** Container kinds supplied by the built-in adapters. */
export const Container = {
  MongoDb: 'mongo-db',
  PostgreSql: 'postgresql',
  RabbitMq: 'rabbit-mq',
  SqlServer: 'sql-server',
} as const;

/**
 * Lifecycle contract implemented by every concrete container adapter.
 *
 * The returned resource must contain consumer-facing connection data. Concrete
 * Testcontainers handles remain private to the implementation.
 */
export interface Container<TResource extends ContainerResource> {
  /** Kind registered in `ContainerRegistry`. */
  readonly kind: TResource['kind'];

  /** Starts the container once and resolves only when it is ready for clients. */
  start(options?: ContainerStartOptions): Promise<TResource>;

  /** Stops the container and releases its external resources. */
  stop(): Promise<void>;
}
