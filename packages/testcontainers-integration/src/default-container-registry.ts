import { Container } from './container-kind.js';
import { ContainerRegistry } from './container-registry.js';
import {
  MongoDbTestContainer,
  type MongoDbTestContainerOptions,
} from './mongo-db/mongo-db-container.js';
import {
  PostgreSqlTestContainer,
  type PostgreSqlTestContainerOptions,
} from './postgresql/postgresql-container.js';
import {
  RabbitMqTestContainer,
  type RabbitMqTestContainerOptions,
} from './rabbit-mq/rabbit-mq-container.js';
import {
  SqlServerTestContainer,
  type SqlServerTestContainerOptions,
} from './sql-server/sql-server-container.js';

/** Configuration for container adapters included with the package. */
export interface DefaultContainerRegistryOptions {
  readonly mongoDb?: MongoDbTestContainerOptions;
  readonly postgreSql?: PostgreSqlTestContainerOptions;
  readonly rabbitMq?: RabbitMqTestContainerOptions;
  readonly sqlServer?: SqlServerTestContainerOptions;
}

/** Creates a registry containing every built-in container adapter. */
export const createDefaultContainerRegistry = (
  options: DefaultContainerRegistryOptions = {},
): ContainerRegistry =>
  new ContainerRegistry()
    .register(Container.MongoDb, () => new MongoDbTestContainer(options.mongoDb))
    .register(Container.PostgreSql, () => new PostgreSqlTestContainer(options.postgreSql))
    .register(Container.RabbitMq, () => new RabbitMqTestContainer(options.rabbitMq))
    .register(Container.SqlServer, () => new SqlServerTestContainer(options.sqlServer));
