import type { Container } from './container-kind.js';
import type { MongoDbResource } from './mongo-db/mongo-db-resource.js';
import type { PostgreSqlResource } from './postgresql/postgresql-resource.js';
import type { RabbitMqResource } from './rabbit-mq/rabbit-mq-resource.js';
import type { SqlServerResource } from './sql-server/sql-server-resource.js';

/** Consumers may augment this interface when they publish another container adapter. */
export interface ContainerResourceMap {
  readonly [Container.MongoDb]: MongoDbResource;
  readonly [Container.PostgreSql]: PostgreSqlResource;
  readonly [Container.RabbitMq]: RabbitMqResource;
  readonly [Container.SqlServer]: SqlServerResource;
}

export type ContainerKind = keyof ContainerResourceMap;
