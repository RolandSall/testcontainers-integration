import type { ContainerResource } from '../container-contract.js';
import { Container } from '../container-kind.js';

/** Host-facing PostgreSQL connection facts discovered after startup. */
export interface PostgreSqlResource extends ContainerResource {
  readonly kind: typeof Container.PostgreSql;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly connectionUri: string;
}
