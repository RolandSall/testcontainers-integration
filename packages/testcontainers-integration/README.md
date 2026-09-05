# @integration-testing/testcontainers

Minimal, typed Testcontainers lifecycle management for Vitest, Jest, and other Node.js test runners.

```ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: {
    database: postgreSql(),
    messages: rabbitMq(),
  },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('database', 'connectionUri'),
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
    },
  },
});
```

The `database` and `messages` keys name the instances used by `fromContainer`. The library installs the mapped values before application setup and restores previous values after the run.

The library starts each configured container once for the test command, supplies typed connection resources to the application, and stops the application before its containers and shared network. The concise configuration is recommended; decorators and direct runner-neutral control are also supported.

## Choose one of the two modes

| Mode | Syntax | Best fit | Tradeoff |
| --- | --- | --- | --- |
| Project configuration | `defineContainerProject({ containers: ... })` | Teams that prefer one explicit, central runner configuration | Requirements live in the runner config |
| Annotation discovery | `@RequiredContainer([Container.PostgreSql, ...])` | Teams that prefer annotations and requirements beside a test marker | Requires decorator support and literal source scanning |

Both modes share the same lifecycle and are fully supported. Project configuration is the recommended default because it has less hidden behavior. If your team prefers annotations, use annotation mode. Keep the modes in separate runner configs rather than combining them in one Jest or Vitest project.

## Install

Requirements are Node.js 22.18 or newer, a Testcontainers-compatible runtime, and Vitest 4.x or Jest 30.x when using a runner adapter.

```bash
npm install --save-dev @integration-testing/testcontainers@beta vitest
```

Install application clients separately. For the PostgreSQL and RabbitMQ example:

```bash
npm install pg amqplib
npm install --save-dev @types/pg @types/amqplib
```

The library owns container lifecycle. It does not prescribe your ORM, database driver, message client, or backend framework.

## Vitest quick start

```ts
// vitest.integration.config.ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: {
    database: postgreSql(),
    messages: rabbitMq(),
  },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('database', 'connectionUri'),
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
    },
  },
  hookTimeout: 360_000,
  testTimeout: 30_000,
});
```

```ts
// test/application.setup.ts
import { Client } from 'pg';
import amqp from 'amqplib';
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';

export const applicationContext =
  installVitestApplicationIntegrationTestSupport({
    start: async () => {
      const database = new Client({ connectionString: process.env.DATABASE_URL });
      await database.connect();
      await database.query(
        'CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)',
      );
      const rabbit = await amqp.connect(process.env.RABBITMQ_URL!);
      const channel = await rabbit.createChannel();
      return { database, rabbit, channel };
    },
    stop: async ({ database, rabbit, channel }) => {
      await channel.close();
      await rabbit.close();
      await database.end();
    },
  });
```

Environment variable names are explicit because the SUT owns their convention. TypeScript validates both the named container and resource property. Runtime validation covers JavaScript or deserialized configuration, and previous values are restored even when setup or teardown fails. If the SUT accepts a configuration object, use the string `application` form and consume typed `resources` in `start(resources)` instead.

The test asserts actual infrastructure behavior:

```ts
import { expect, test } from 'vitest';
import { applicationContext } from './application.setup.js';

test('stores a PostgreSQL row', async () => {
  const { database } = applicationContext.current();
  await database.query(
    'INSERT INTO notes (id, body) VALUES ($1, $2)',
    ['note-1', 'actually saved'],
  );
  const result = await database.query<{ body: string }>(
    'SELECT body FROM notes WHERE id = $1',
    ['note-1'],
  );
  expect(result.rows[0]?.body).toBe('actually saved');
});

test('publishes and receives a RabbitMQ message', async () => {
  const { channel } = applicationContext.current();
  const queue = await channel.assertQueue('', { exclusive: true });
  const received = new Promise<string>((resolve) => {
    void channel.consume(queue.queue, (message) => {
      if (message !== null) resolve(message.content.toString('utf8'));
    }, { noAck: true });
  });
  channel.sendToQueue(queue.queue, Buffer.from('actually received'));
  await expect(received).resolves.toBe('actually received');
});
```

```bash
npx vitest run --config vitest.integration.config.ts
```

## Jest quick start

Use the same application logic with the Jest installer and configuration:

```ts
// jest.integration.config.ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/jest';

export default defineContainerProject({
  include: ['**/test/**/*.integration.test.ts'],
  containers: {
    database: postgreSql(),
    messages: rabbitMq(),
  },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('database', 'connectionUri'),
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
    },
  },
  jest: {
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.jest.json', useESM: false }],
    },
    testTimeout: 30_000,
  },
});
```

Create `tsconfig.jest.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node"
  }
}
```

```ts
import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';

export const applicationContext =
  installJestApplicationIntegrationTestSupport({
    start: startYourApplication,
    stop: (application) => application.close(),
  });
```

```bash
npx jest --config jest.integration.config.ts --runInBand
```

For direct IDE runs, configure the IDE to use that file or add a conventional `jest.config.ts`:

```ts
export { default } from './jest.integration.config.js';
```

## Framework support

This is not NestJS-specific. The only application contract is:

```ts
interface ApplicationLifecycle<TApplication> {
  start(resources: ContainerResources): Promise<TApplication>;
  stop(application: TApplication): Promise<void>;
}
```

It works with NestJS, Fastify, Express, Koa, Hapi, plain Node.js servers, and background workers. Return the framework object or worker handle from `start`, then close it in `stop`.

## Optional annotation mode

For test-file-local declarations, configure the scanner-based global lifecycle and annotate a class:

```ts
@RequiredContainer([Container.RabbitMq, Container.PostgreSql])
@ApplicationIntegrationTest
export class OrderApplicationIntegrationTest {}
```

One annotation lists every required container. The previous single-container and variadic forms remain supported for compatibility. Annotation and concise project modes share the same runtime, adapters, resource types, and cleanup. Keep them in separate runner projects rather than mixing both discovery modes in one config.

## Built-ins and advanced usage

| Factory | Resource |
| --- | --- |
| `postgreSql()` | host, port, credentials, database, connection URI |
| `sqlServer()` | host, port, credentials, database |
| `mongoDb()` | host, port, connection string |
| `rabbitMq()` | host, port, AMQP and AMQPS URLs |

Configuration keys identify named instances, so an explicit project can run two containers of the same kind:

```ts
containers: {
  primaryDatabase: postgreSql(),
  auditDatabase: postgreSql({ database: 'audit' }),
},
application: {
  setup: './test/application.setup.ts',
  environment: {
    DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
    AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
  },
},
```

Use `resources.getNamed('auditDatabase', Container.PostgreSql)` for direct named access. `resources.get(Container.PostgreSql)` works when exactly one resource of that kind exists. The advanced `ContainerRegistry`, `GenericTestContainer`, `ContainerRuntime`, and `IntegrationEnvironment` APIs support custom images, custom runners, preparation callbacks, and typed custom resources.

Override the image used by a compatible built-in adapter:

```ts
containers: {
  database: postgreSql({ image: 'postgres:17-alpine' }),
  messages: rabbitMq({ image: 'rabbitmq:4.1.8-management-alpine' }),
}
```

Arbitrary Docker images use `GenericTestContainer`. It exposes internal ports without fixing host ports. Docker selects available host ports, and the resource mapper reads the real values after startup:

```ts
const container = new GenericTestContainer({
  kind: 'redis',
  image: 'redis:7-alpine',
  exposedPorts: [6379],
  resource: ({ host, mappedPorts }) => {
    const port = mappedPorts[6379];
    if (port === undefined) throw new Error('Redis port was not mapped');
    return { kind: 'redis', host, port };
  },
});
```

The built-in adapters use the same Testcontainers mechanism, such as `started.getMappedPort(5672)` for RabbitMQ. `ContainerResources.get<TKind>(kind)` maps that kind through `ContainerResourceMap`, which is why built-in and consumer-augmented resources retain their precise TypeScript types. Native Docker handles remain in global setup; only serializable connection facts are supplied to test workers.

The package contains compiled `dist` files, this README, and the MIT license. It does not contain examples, source tests, workspace configuration, application clients, ORMs, or web frameworks. Vitest and Jest are optional peers.

For small projects with one stable global setup, raw Testcontainers may remain simpler. This library is most useful where lifecycle glue is repeated, multiple infrastructure services are involved, or consistent runner and cleanup behavior matters.
