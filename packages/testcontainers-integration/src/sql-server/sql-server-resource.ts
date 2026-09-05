import type { Container } from '../container-kind.js';

/** Host connection information discovered after SQL Server starts. */
export interface SqlServerResource {
  /** Resource discriminator used for typed lookup. */
  readonly kind: typeof Container.SqlServer;
  /** Hostname reachable from the process running the tests. */
  readonly host: string;
  /** Random Docker host port mapped to SQL Server port 1433. */
  readonly port: number;
  /** SQL Server login name. */
  readonly username: string;
  /** Ephemeral SQL Server password configured by the adapter. */
  readonly password: string;
  /** Initial database reported by the Testcontainers module. */
  readonly database: string;
}
