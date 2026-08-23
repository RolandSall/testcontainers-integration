import { Container } from './container-kind.js';
import { ContainerRegistry } from './container-registry.js';
import {
  SqlServerTestContainer,
  type SqlServerTestContainerOptions,
} from './sql-server/sql-server-container.js';

/** Configuration for container adapters included with the package. */
export interface DefaultContainerRegistryOptions {
  readonly sqlServer?: SqlServerTestContainerOptions;
}

/** Creates a registry containing the built-in SQL Server adapter. */
export const createDefaultContainerRegistry = (
  options: DefaultContainerRegistryOptions = {},
): ContainerRegistry =>
  new ContainerRegistry().register(
    Container.SqlServer,
    () => new SqlServerTestContainer(options.sqlServer),
  );
