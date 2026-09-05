import { expect, test } from 'vitest';
import { Container } from './container-kind.js';
import { createDefaultContainerRegistry } from './default-container-registry.js';
import { MongoDbTestContainer } from './mongo-db/mongo-db-container.js';
import { PostgreSqlTestContainer } from './postgresql/postgresql-container.js';
import { RabbitMqTestContainer } from './rabbit-mq/rabbit-mq-container.js';
import { SqlServerTestContainer } from './sql-server/sql-server-container.js';

test(
  'given the default registry, when each supported kind is created, then the matching adapter is returned without starting Docker',
  () => {
    const registry = createDefaultContainerRegistry();

    expect(registry.create(Container.MongoDb)).toBeInstanceOf(MongoDbTestContainer);
    expect(registry.create(Container.PostgreSql)).toBeInstanceOf(PostgreSqlTestContainer);
    expect(registry.create(Container.RabbitMq)).toBeInstanceOf(RabbitMqTestContainer);
    expect(registry.create(Container.SqlServer)).toBeInstanceOf(SqlServerTestContainer);
  },
);
