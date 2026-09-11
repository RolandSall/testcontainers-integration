# @integration-testing/testcontainers

Minimal, typed Testcontainers lifecycle management for NestJS and other Node.js backends using Vitest, Jest, or a custom test runner.

Declare the infrastructure each integration test needs beside the test itself. The library starts shared containers once, creates dedicated containers for each test file that requests them, gives the file's application typed connection details, and cleans up each lifecycle in ownership order.

```ts
import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';

@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
  auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class OrderApplicationIntegrationTest {}
```

Annotation mode is the primary API shown in this guide. A project configuration API is also supported for developers who prefer not to use annotations.

## Choose one of the two modes

Both modes use the same containers, typed resources, application lifecycle, and cleanup behavior.

| Mode | Syntax | Best fit | Tradeoff |
| --- | --- | --- | --- |
| Annotation mode | `@RequiredContainer({ database: { kind, isolation } })` | Teams that want each test file to declare its own infrastructure requirements | Requires `experimentalDecorators` and the scanner lifecycle settings shown below |
| Project configuration | `defineContainerProject({ containers: ... })` | Developers who prefer one explicit, central runner configuration instead of annotations | Every container requirement is declared in the config rather than beside a test |

This guide starts with annotation mode. If annotations are not your preference, use the project configuration mode shown second. Do not combine both modes in the same Jest or Vitest project; use separate runner configs when a repository uses both.

## Use shared and dedicated containers

Every named container requires one explicit isolation value:

| Isolation | Behavior |
| --- | --- |
| `'shared'` | One instance is started globally and reused by every matching test file that declares the same name and kind as shared. |
| `'dedicated'` | Every test file receives its own instance. All dedicated containers in that file share one private network. |

Use `shared` for infrastructure that can safely serve multiple test files, such as a RabbitMQ instance where each file uses unique queue, exchange, and routing-key names. Use `dedicated` when a file should own its mutable state or database schema without affecting other files.

In annotation mode, put the isolation choice beside every named container:

```ts
import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';

@RequiredContainer({
  messages: {
    kind: Container.RabbitMq,
    isolation: 'shared',
  },
  primaryDatabase: {
    kind: Container.PostgreSql,
    isolation: 'dedicated',
  },
  auditDatabase: {
    kind: Container.PostgreSql,
    isolation: 'dedicated',
  },
})
@ApplicationIntegrationTest
export class OrderApplicationIntegrationTest {}
```

Every annotation test file declaring `messages` with the same name, kind, and `shared` isolation receives the same RabbitMQ instance. Each file receives its own `primaryDatabase` and `auditDatabase` instances because those declarations are `dedicated`.

Isolation belongs to the container, so one file can share RabbitMQ while receiving two independent PostgreSQL databases. Jest and Vitest still control how many workers run. The library does not change `maxWorkers` and does not use worker identifiers to select resources.

Dedicated means dedicated per test file, not per individual test. Tests inside one file share that file's containers and application. They still need transactions, unique data, or cleanup when they mutate the same state concurrently. This setting is unrelated to Testcontainers' cross-run container reuse feature.

Database transaction isolation is currently the developer's responsibility. Choose an approach that fits the test, such as a transaction per test, unique test data, explicit cleanup, or a dedicated container. This package controls container and application lifecycles, but it does not automatically wrap application database operations in a rollback-only transaction.

Automatic rollback-based data isolation is being developed separately in [`data-integration-testing`](https://github.com/RolandSall/data-integration-testing). That library is still a work in progress and is not bundled with or required by this package.

In project configuration mode, put the same isolation choice in each container factory. The configuration applies to every file matched by `include`:

```ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: {
    messages: rabbitMq({ isolation: 'shared' }),
    primaryDatabase: postgreSql({ isolation: 'dedicated' }),
    auditDatabase: postgreSql({ isolation: 'dedicated' }),
  },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
      DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
      AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
    },
  },
  vitest: { maxWorkers: 2 },
});
```

With two files running together, both applications receive the same RabbitMQ mapped port and different primary and audit PostgreSQL ports. A dedicated container is started lazily when its file begins, so increasing the runner's worker count can increase concurrent Docker load. Configure Vitest with `vitest: { maxWorkers }`, configure Jest with `jest: { maxWorkers }`, or keep your existing runner setting. Command-line worker overrides remain runner-owned and are not rewritten by the library.

Shared and dedicated containers use different Docker networks. The supported mixed model is a host-side SUT connecting through mapped ports. Direct container-to-container communication between the shared and dedicated networks is not supported.

If dedicated startup, preparation, environment resolution, or application bootstrap fails, the file immediately restores its environment and stops every file-owned container and network that started. The application `stop` callback runs only after `start` returned an application instance. Shared containers remain owned by global teardown, which stops all of them even when the test run fails normally.

### Failure path when the runner is terminated

A hung bootstrap followed by a forced runner termination is different from a rejected bootstrap. After `SIGKILL`, Node.js cannot run `catch`, `finally`, application `stop`, file cleanup, or global teardown. In that case, Testcontainers' Ryuk resource reaper provides eventual cleanup for the labeled containers and networks created by the terminated process. This is resource cleanup, not graceful application shutdown.

The repository pins this behavior in a runner-neutral Node.js test under [`runner-tests/file-isolation/termination`](https://github.com/RolandSall/testcontainers-integration/tree/main/runner-tests/file-isolation/termination). The same parent test runs once with a Vitest child and once with a Jest child. Each child starts one shared and one dedicated PostgreSQL container, performs and reads back a real database write, then leaves application startup pending. The parent confirms that both containers and both networks exist, kills the complete child process group with `SIGKILL`, verifies that application `stop` did not run, and waits until those exact fixture-owned Docker resources have disappeared.

Run that failure path independently from the repository with:

```sh
bun run test:termination-cleanup:docker
```

## Why use it?

- Explicit shared or file-dedicated ownership for each named container.
- Typed PostgreSQL, SQL Server, MongoDB, and RabbitMQ connection resources, plus image overrides and typed resources for custom Docker images.
- Dynamic mapped ports, with no hard-coded host ports.
- Application startup only after infrastructure is ready.
- Deterministic reverse-order cleanup, including partial-startup failures.
- First-class Vitest 4 and Jest 30 lifecycle adapters.
- Works with NestJS applications: start the app after containers are ready and close it after the tests. NestJS remains your application's dependency, not this package's dependency.
- Can be used without Jest or Vitest by starting and stopping `ContainerRuntime` from Cucumber hooks, Node.js test hooks, or your own test setup.
- No dependency on NestJS or any other backend framework.

## Requirements

- Node.js 22.22 or newer
- Docker, Podman, or another Testcontainers-compatible runtime
- Vitest 4.x or Jest 30.x for its matching adapter
- TypeScript 5.5 through 6.x when using TypeScript

Most TypeScript backends already have TypeScript and a test runner. In that case, install only this library:

```bash
npm install --save-dev @integration-testing/testcontainers
```

If the project does not have a test runner yet, install one. You do not need both runners.

For Vitest:

```bash
npm install --save-dev vitest@4
```

For Jest with TypeScript:

```bash
npm install --save-dev jest@30 ts-jest@29 @types/jest
```

The library already includes TypeScript for annotation scanning. Your application should still keep its own direct TypeScript dependency when it compiles or type-checks TypeScript. Jest additionally needs a configured transformer such as `ts-jest`; Vitest transforms TypeScript itself. `@types/jest` supplies Jest's global TypeScript types.

The supported runner ranges are Vitest `>=4 <5` and Jest `>=30 <31`. Vitest 4.0.18 and 4.1.11 have both been exercised, so 4.1.11 is not the minimum.

With npm 10.9, if installing Vitest fails with an internal `edgesOut` resolver error, retry the same command with `--legacy-peer-deps`. This is an npm resolver workaround; it does not change the runtime configuration.

Complete PostgreSQL and RabbitMQ applications with their client dependencies are available in the [Vitest annotation example](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/vitest-annotation) and [Jest annotation example](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/jest-annotation).

A minimal TypeScript setup for the Vitest example is:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "*.config.ts"]
}
```

## Example SUT used by both modes

SUT means system under test. Both modes below use the same small framework-free backend so their tests can perform real PostgreSQL and RabbitMQ operations. `ExampleBackend` is application code being tested, not part of the library API. If your project already has an application or service, use that instead.

```ts
// src/example-backend.ts
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { Client } from 'pg';

export class ExampleBackend {
  private constructor(
    private readonly database: Client,
    private readonly rabbitConnection: ChannelModel,
    private readonly rabbitChannel: Channel,
  ) {}

  static async start(
    databaseUrl: string,
    rabbitMqUrl: string,
  ): Promise<ExampleBackend> {
    const database = new Client({ connectionString: databaseUrl });
    await database.connect();
    await database.query(
      'CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)',
    );
    const rabbitConnection = await amqp.connect(rabbitMqUrl);
    const rabbitChannel = await rabbitConnection.createChannel();
    return new ExampleBackend(database, rabbitConnection, rabbitChannel);
  }

  async saveAndFind(id: string, body: string): Promise<string | undefined> {
    await this.database.query(
      'INSERT INTO notes (id, body) VALUES ($1, $2)',
      [id, body],
    );
    const result = await this.database.query<{ body: string }>(
      'SELECT body FROM notes WHERE id = $1',
      [id],
    );
    return result.rows[0]?.body;
  }

  async publishAndReceive(body: string): Promise<string> {
    const queue = await this.rabbitChannel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    const received = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('RabbitMQ message timed out')),
        10_000,
      );
      void this.rabbitChannel.consume(queue.queue, (message) => {
        if (message !== null) {
          clearTimeout(timeout);
          this.rabbitChannel.ack(message);
          resolve(message.content.toString('utf8'));
        }
      }).catch(reject);
    });
    this.rabbitChannel.sendToQueue(queue.queue, Buffer.from(body));
    return received;
  }

  async close(): Promise<void> {
    await this.rabbitChannel.close();
    await this.rabbitConnection.close();
    await this.database.end();
  }
}
```

## Annotation mode

Annotation mode keeps each test file's infrastructure requirements beside its tests. The scanner reads one literal, named `@RequiredContainer({...})` declaration before test modules load. Every declaration includes its container kind and isolation.

### Required annotation settings

Enable decorators in the `tsconfig.json` that compiles your tests:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

Name the test with the default `.container.integration.test.ts` suffix and use a literal declaration:

```ts
// test/order.container.integration.test.ts
@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
  auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class OrderApplicationIntegrationTest {}
```

The complete Vitest and Jest configurations below register the required lifecycle hooks. For a different filename convention, set `testFileSuffix` and update the runner's `include` or `testMatch` pattern. Point your IDE to that same runner config. A Jest `tsconfig.jest.json` must inherit the decorator setting; `emitDecoratorMetadata` is not required by this library.

### Vitest annotation setup

Configure annotation discovery and the application setup in one file:

```ts
// vitest.annotation.config.ts
import { defineAnnotationProject } from '@integration-testing/testcontainers/vitest';

export default defineAnnotationProject({
  application: './test/application.vitest.setup.ts',
  hookTimeout: 360_000,
  testTimeout: 30_000,
});
```

`defineAnnotationProject` supplies the default test-file pattern, scanner setup, container teardown, and application setup registration. Pass `include` or `testFileSuffix` only when your project uses a different convention.

Connect the same SUT shown above by reading typed resources:

```ts
// test/application.vitest.setup.ts
import { Container } from '@integration-testing/testcontainers';
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';
import { ExampleBackend } from '../src/example-backend.js';

export const applicationContext = installVitestApplicationIntegrationTestSupport({
  start: (resources) => ExampleBackend.start(
    resources.get(Container.PostgreSql).connectionUri,
    resources.get(Container.RabbitMq).amqpUrl,
  ),
  stop: (application) => application.close(),
});
```

The annotated marker and the actual tests can live in the same file:

```ts
// test/order.container.integration.test.ts
import { expect, test } from 'vitest';
import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { applicationContext } from './application.vitest.setup.js';

@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  database: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class OrderApplicationIntegrationTest {}

test('stores and reads a row in PostgreSQL', async () => {
  await expect(
    applicationContext.current().saveAndFind('note-1', 'actually saved'),
  ).resolves.toBe('actually saved');
});
```

```bash
npx vitest run --config vitest.annotation.config.ts
```

Keep one `@ApplicationIntegrationTest` marker class per test file.

### Jest annotation setup

Jest uses the same one-file annotation project helper:

```ts
// jest.annotation.config.ts
import { defineAnnotationProject } from '@integration-testing/testcontainers/jest';

export default defineAnnotationProject({
  application: './test/application.jest.setup.ts',
  jest: {
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.jest.json', useESM: false }],
    },
    testTimeout: 30_000,
  },
});
```

The helper supplies `testMatch`, `globalSetup`, `globalTeardown`, and `setupFilesAfterEnv`. The remaining `jest` block is ordinary TypeScript transformation configuration. Keep your existing transform when your project already runs TypeScript tests successfully.

```ts
// test/application.jest.setup.ts
import { Container } from '@integration-testing/testcontainers';
import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';
import { ExampleBackend } from '../src/example-backend.js';

export const applicationContext = installJestApplicationIntegrationTestSupport({
  start: (resources) => ExampleBackend.start(
    resources.get(Container.PostgreSql).connectionUri,
    resources.get(Container.RabbitMq).amqpUrl,
  ),
  stop: (application) => application.close(),
});
```

Write the annotated Jest test:

```ts
// test/order.container.integration.test.ts
import { expect, test } from '@jest/globals';
import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { applicationContext } from './application.jest.setup.js';

@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  database: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class OrderApplicationIntegrationTest {}

test('stores and reads a row in PostgreSQL', async () => {
  await expect(
    applicationContext.current().saveAndFind('note-1', 'actually saved'),
  ).resolves.toBe('actually saved');
});
```

Then run:

```bash
npx jest --config jest.annotation.config.ts --runInBand
```

Keep exactly one named `@RequiredContainer({...})` marker class in each matched annotation test file. Dynamic keys, spreads, computed values, missing isolation, and multiple marker classes are rejected with a file-specific error. Complete repository fixtures live in [`examples/vitest-annotation`](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/vitest-annotation) and [`examples/jest-annotation`](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/jest-annotation).

Do not mix project configuration and annotation discovery in the same runner project. Keep them as separate Vitest or Jest configs if you use both styles in one repository.

## Project configuration mode

Project configuration is the second mode. Use it when you prefer to declare all required containers in one explicit runner configuration instead of using annotations.

### Get started with Vitest

This complete example starts PostgreSQL and RabbitMQ, starts a plain Node.js backend, writes and reads a database row, and publishes and consumes a message.

#### 1. Configure the integration project

```ts
// vitest.integration.config.ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: {
    database: postgreSql({ isolation: 'dedicated' }),
    messages: rabbitMq({ isolation: 'shared' }),
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

No consumer-owned global setup or teardown files are needed.

The object keys `database` and `messages` name the two container instances. Each `fromContainer(name, property)` binding copies a discovered connection value into the process executing that test file immediately before the SUT starts. TypeScript rejects unknown names and properties that do not belong to that container kind. The library also validates deserialized configuration at runtime and restores previous environment values after application shutdown or startup failure.

#### 2. Register how the application starts and stops

The setup file connects the sample application to the test lifecycle. The installer resolves and installs `DATABASE_URL` and `RABBITMQ_URL` before it calls `start`. It keeps the value returned by `start` available during tests and passes it to `stop` afterward. Code that needs these variables should read them inside `start`, as shown here, rather than at module top level:

```ts
// test/application.setup.ts
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';
import { ExampleBackend } from '../src/example-backend.js';

export const applicationContext = installVitestApplicationIntegrationTestSupport({
  start: () => ExampleBackend.start(
    process.env.DATABASE_URL!,
    process.env.RABBITMQ_URL!,
  ),
  stop: (application) => application.close(),
});
```

Environment names are deliberately explicit because only the application knows whether it expects `DATABASE_URL`, `PG_URL`, or another convention. If a SUT accepts a configuration object instead, keep the shorter `application: './test/application.setup.ts'` form and read typed resources in `start(resources)` with `resources.get(Container.PostgreSql)`.

#### 3. Write the integration tests

This is the actual test code. It calls the application returned by `start` and asserts observable database and messaging behavior:

```ts
// test/example.integration.test.ts
import { expect, test } from 'vitest';
import { applicationContext } from './application.setup.js';

test('stores and reads a row in PostgreSQL', async () => {
  await expect(
    applicationContext.current().saveAndFind('note-1', 'actually saved'),
  ).resolves.toBe('actually saved');
});

test('publishes and consumes a RabbitMQ message', async () => {
  await expect(
    applicationContext.current().publishAndReceive('actually received'),
  ).resolves.toBe('actually received');
});
```

Run only the integration project:

```bash
npx vitest run --config vitest.integration.config.ts
```

The repository contains this as a runnable example in [`examples/vitest-project`](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/vitest-project).

### Get started with Jest

The application lifecycle and assertions are identical. Only the runner imports and config differ:

```ts
// jest.integration.config.ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/jest';

export default defineContainerProject({
  include: ['**/test/**/*.integration.test.ts'],
  containers: {
    database: postgreSql({ isolation: 'dedicated' }),
    messages: rabbitMq({ isolation: 'shared' }),
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

This emits CommonJS for Jest while the package remains ESM. Projects already using a working Jest transform can pass that transform unchanged.

```ts
// test/application.setup.ts
import { installJestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/jest';
import { ExampleBackend } from '../src/example-backend.js';

export const applicationContext =
  installJestApplicationIntegrationTestSupport({
    start: () => ExampleBackend.start(
      process.env.DATABASE_URL!,
      process.env.RABBITMQ_URL!,
    ),
    stop: (application) => application.close(),
  });
```

```ts
// test/example.integration.test.ts
import { expect, test } from '@jest/globals';
import { applicationContext } from './application.setup.js';

test('stores and reads a row in PostgreSQL', async () => {
  await expect(
    applicationContext.current().saveAndFind('note-1', 'actually saved'),
  ).resolves.toBe('actually saved');
});

test('publishes and consumes a RabbitMQ message', async () => {
  await expect(
    applicationContext.current().publishAndReceive('actually received'),
  ).resolves.toBe('actually received');
});
```

Run it with:

```bash
npx jest --config jest.integration.config.ts --runInBand
```

Jest only auto-discovers conventional names such as `jest.config.ts`. If you keep the integration-specific filename, point WebStorm at it or add a conventional forwarding file:

```ts
// jest.config.ts
export { default } from './jest.integration.config.ts';
```

See the runnable [`examples/jest-project`](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/jest-project).

## NestJS and framework support

NestJS is supported through the application lifecycle contract, without forcing NestJS on projects that use another framework:

```ts
interface ApplicationLifecycle<TApplication> {
  start(resources: ContainerResources): Promise<TApplication>;
  stop(application: TApplication): Promise<void>;
}
```

That works with:

| Backend | Typical value returned by `start` | Typical `stop` |
| --- | --- | --- |
| NestJS | `INestApplication` | `application.close()` |
| Fastify | `FastifyInstance` | `application.close()` |
| Express | Node `Server` | close the server |
| Koa or Hapi | Framework server/application | framework shutdown API |
| Worker or consumer | Your worker handle | disconnect/stop method |
| Plain Node.js | Any class or server handle | your cleanup method |

The runnable examples intentionally use plain Node.js clients so framework neutrality is tested rather than merely claimed.

### NestJS example

Keep the same container project configuration shown above. Its environment bindings are installed before the `start` callback compiles `AppModule`, so configuration read during Nest bootstrap receives that test file's selected shared and dedicated values. The dynamic import inside `start` also covers applications that read environment variables while `AppModule` is first evaluated.

Install the Nest testing tools and HTTP test client if your application does not already have them:

```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/testing reflect-metadata rxjs
npm install --save-dev supertest @types/supertest
```

Register the Nest application lifecycle:

```ts
// test/application.setup.ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';

export const applicationContext =
  installVitestApplicationIntegrationTestSupport<INestApplication>({
    start: async () => {
      const { AppModule } = await import('../src/app.module.js');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const application = moduleRef.createNestApplication();
      await application.init();
      return application;
    },
    stop: (application) => application.close(),
  });
```

Test the initialized Nest application through its HTTP server:

```ts
// test/notes.integration.test.ts
import request from 'supertest';
import { expect, test } from 'vitest';
import { applicationContext } from './application.setup.js';

test('stores and reads a note through the NestJS API', async () => {
  const server = applicationContext.current().getHttpServer();
  const created = await request(server)
    .post('/notes')
    .send({ body: 'saved through NestJS' })
    .expect(201);

  const found = await request(server)
    .get(`/notes/${created.body.id}`)
    .expect(200);

  expect(found.body).toMatchObject({ body: 'saved through NestJS' });
});
```

This assumes the SUT already exposes `POST /notes` and `GET /notes/:id`. Replace those requests with your application endpoints. For Jest, use `installJestApplicationIntegrationTestSupport` and import `test` and `expect` from `@jest/globals`; the Nest lifecycle itself stays the same. NestJS works with both project configuration and annotation discovery.

## Use resources without starting an application

Omit `application` when a test connects to the infrastructure directly:

```ts
import { sqlServer } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: sqlServer({ isolation: 'dedicated' }) },
});
```

Read the injected resource in a Vitest test:

```ts
import { Container } from '@integration-testing/testcontainers';
import { injectedContainerResources } from '@integration-testing/testcontainers/vitest';
import { expect, test } from 'vitest';

test('uses the file container', () => {
  const database = injectedContainerResources().getNamed(
    'database',
    Container.SqlServer,
  );
  expect(database.port).toBeGreaterThan(0);
});
```

Jest exposes the same accessor from `@integration-testing/testcontainers/jest`:

```ts
import { injectedContainerResources } from '@integration-testing/testcontainers/jest';
```

Use `getNamed(name, kind)` when the configuration key matters or more than one instance has the same kind. Use `get(kind)` when exactly one resource of that kind exists.

Read injected resources from a test, `beforeAll`, or a later hook. Calling the accessor during module collection is rejected because file-dedicated containers have not started yet.

## Built-in containers

| Factory | Typed resource |
| --- | --- |
| `postgreSql({ isolation, ...options })` | `host`, `port`, `database`, `username`, `password`, `connectionUri` |
| `sqlServer({ isolation, ...options })` | `host`, `port`, `database`, `username`, `password` |
| `mongoDb({ isolation, ...options })` | `host`, `port`, host-safe `connectionString` |
| `rabbitMq({ isolation, ...options })` | `host`, `port`, `amqpUrl`, `amqpsUrl` |

Configuration keys identify named instances. Explicit projects can run multiple containers of the same kind and bind each one independently:

```ts
containers: {
  primaryDatabase: postgreSql({ isolation: 'dedicated' }),
  auditDatabase: postgreSql({ isolation: 'dedicated', database: 'audit' }),
},
application: {
  setup: './test/application.setup.ts',
  environment: {
    DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
    AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
  },
},
```

For direct resource access, use `resources.getNamed('auditDatabase', Container.PostgreSql)`. The shorter `resources.get(Container.PostgreSql)` works when exactly one resource of that kind exists and throws a clear ambiguity error otherwise. The concise `containers` map accepts the four built-in factories. Use the registry API below for arbitrary images and typed custom resources.

### Use a different Docker image

Every built-in factory accepts an image override. The image must remain compatible with that service's Testcontainers adapter:

```ts
containers: {
  database: postgreSql({ isolation: 'dedicated', image: 'postgres:17-alpine' }),
  messages: rabbitMq({ isolation: 'shared', image: 'rabbitmq:4.1.8-management-alpine' }),
}
```

For an entirely different service, use `GenericTestContainer`. The following Vitest annotation example runs `redis:7-alpine` and keeps resource lookup typed.

Install the application client:

```bash
npm install redis
```

Define the custom kind and resource type:

```ts
// test/container-catalog.ts
import {
  defineContainerCatalog,
  type ContainerResource,
} from '@integration-testing/testcontainers';

export interface RedisResource extends ContainerResource {
  readonly kind: 'redis';
  readonly host: string;
  readonly port: number;
}

declare module '@integration-testing/testcontainers/container-resource-map' {
  interface ContainerResourceMap {
    readonly redis: RedisResource;
  }
}

export const Container = defineContainerCatalog({ Redis: 'redis' as const });
```

Register the image and give the scanner the same catalog:

```ts
// test/redis.global-setup.ts
import {
  ContainerRegistry,
  GenericTestContainer,
} from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';
import { Container } from './container-catalog.js';

const registry = new ContainerRegistry().register(
  Container.Redis,
  () => new GenericTestContainer({
    kind: Container.Redis,
    image: 'redis:7-alpine',
    exposedPorts: [6379],
    resource: ({ host, mappedPorts }) => {
      const port = mappedPorts[6379];
      if (port === undefined) throw new Error('Redis port was not mapped');
      return { kind: Container.Redis, host, port };
    },
  }),
);

const lifecycle = createVitestContainerGlobalSetup({
  root: process.cwd(),
  registry,
  containerNames: Container,
});

export const setup = lifecycle.setup;
export const teardown = lifecycle.teardown;
```

Register the global lifecycle and the package's file lifecycle in Vitest:

```ts
// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.container.integration.test.ts'],
    globalSetup: ['./test/redis.global-setup.ts'],
    setupFiles: ['@integration-testing/testcontainers/vitest/file-setup'],
    sequence: { setupFiles: 'list' },
    isolate: true,
  },
});
```

Then annotate and test the service:

```ts
// test/redis.container.integration.test.ts
import { RequiredContainer } from '@integration-testing/testcontainers';
import { injectedContainerResources } from '@integration-testing/testcontainers/vitest';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { Container } from './container-catalog.js';

@RequiredContainer({
  redis: { kind: Container.Redis, isolation: 'shared' },
})
class RedisIntegrationTest {}

let client: RedisClientType;

beforeAll(async () => {
  const redis = injectedContainerResources().get(Container.Redis);
  client = createClient({ url: `redis://${redis.host}:${redis.port}` });
  await client.connect();
});

afterAll(async () => {
  if (client?.isOpen) await client.quit();
});

test(`${RedisIntegrationTest.name} stores and reads a value`, async () => {
  await client.set('integration-key', 'actually saved');
  await expect(client.get('integration-key')).resolves.toBe('actually saved');
});
```

The scanner requires the catalog to be imported under the identifier `Container`, and the same catalog must be passed as `containerNames`. The registry/runtime API can also be used directly without annotations. The repository contains the typed declaration in [`examples/custom-container`](https://github.com/RolandSall/testcontainers-integration/tree/main/examples/custom-container).

The global setup registry starts custom declarations marked `shared`. For a custom declaration marked `dedicated`, import the same registry module from a runner setup file and call `configureVitestContainerFileSupport({ registry })` or `configureJestContainerFileSupport({ registry })` before the package's file hook runs. An application setup module can configure the registry and install the application lifecycle together.

### How typed resources and dynamic ports work

The adapter exposes the service's internal port but does not bind a fixed host port. Docker chooses an available host port when the container starts. The adapter then reads the actual mapping:

```ts
const started = await new RabbitMQContainer(image).start();

const resource: RabbitMqResource = {
  kind: Container.RabbitMq,
  host: started.getHost(),
  port: started.getMappedPort(5672),
  amqpUrl: started.getAmqpUrl(),
  amqpsUrl: started.getAmqpsUrl(),
};
```

For a custom image, `GenericTestContainer` performs the same mapping for every exposed port:

```ts
const started = await new GenericContainer(image)
  .withExposedPorts(6379)
  .start();

const resource = {
  kind: 'redis',
  host: started.getHost(),
  port: started.getMappedPort(6379),
};
```

The resource type is selected from the requested container kind:

```ts
get<TKind extends ContainerKind>(kind: TKind): ContainerResourceMap[TKind]
getNamed<TKind extends ContainerKind>(name: string, kind: TKind): ContainerResourceMap[TKind]
```

Therefore `resources.get(Container.PostgreSql)` and `resources.getNamed('primaryDatabase', Container.PostgreSql)` are inferred as `PostgreSqlResource`, while an augmented custom `redis` kind returns the consumer's Redis resource type. Only plain connection data crosses into Jest or Vitest workers; native Docker handles stay inside global setup for safe cleanup.

### Container logs

Lifecycle events are logged by default. Raw container stdout and stderr are disabled so normal test output stays concise. Enable them when diagnosing startup behavior:

```ts
export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: postgreSql({ isolation: 'shared' }) },
  containerLogs: true,
});
```

Annotation-project users can set `containerLogs: true` in `defineAnnotationProject`. Custom-registry and direct-runtime users can pass it to `createVitestContainerGlobalSetup`, `createJestContainerGlobalSetup`, or `ContainerRuntime`.

## Direct runner-neutral usage

```ts
import {
  Container,
  ContainerRuntime,
  createDefaultContainerRegistry,
} from '@integration-testing/testcontainers';

const runtime = new ContainerRuntime(createDefaultContainerRegistry());
try {
  const resources = await runtime.start([
    Container.PostgreSql,
    Container.RabbitMq,
  ]);
  console.log(resources.get(Container.PostgreSql).connectionUri);
  console.log(resources.get(Container.RabbitMq).amqpUrl);
} finally {
  await runtime.stop();
}
```

Use this from Cucumber hooks, Node's built-in test runner, or a custom test harness. `IntegrationEnvironment` additionally coordinates application startup and shutdown.
