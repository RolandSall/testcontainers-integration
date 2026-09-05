import type { ContainerResource } from '../container-contract.js';
import { Container } from '../container-kind.js';

/** Host-facing MongoDB connection facts discovered after startup. */
export interface MongoDbResource extends ContainerResource {
  readonly kind: typeof Container.MongoDb;
  readonly host: string;
  readonly port: number;
  readonly connectionString: string;
}
