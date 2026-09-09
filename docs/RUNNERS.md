# Runner lifecycle

## Annotation mode

Both adapters configure built-in annotation discovery without consumer-owned global setup files:

```ts
import { defineAnnotationProject } from '@integration-testing/testcontainers/vitest';

export default defineAnnotationProject({
  application: './test/application.vitest.setup.ts',
  hookTimeout: 360_000,
  testTimeout: 30_000,
  vitest: { maxWorkers: 2 },
});
```

Every matched file declares exactly one named marker:

```ts
@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
  auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
class OrderIntegrationTest {}
```

Import the Jest helper from `@integration-testing/testcontainers/jest` and pass ordinary Jest
options through its `jest` property. The helper owns scanner setup, internal file hooks, and
container teardown. Use the lower-level global and file lifecycle APIs when annotation discovery
needs a custom container registry.

## Project configuration mode

Both adapters can own setup and teardown from one serializable declaration:

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

Import the Jest variant from `@integration-testing/testcontainers/jest`. Both variants use the
same runtime, named resources, application contract, and reverse-order cleanup. Keep project
configuration and annotation discovery in separate runner projects.

## Vitest

Vitest global setup starts only shared declarations and transfers their serializable resources
through `project.provide`. The package inserts its internal file setup before the consumer's
application setup and forces setup files to run in list order. The internal `beforeAll` lazily
starts the file's dedicated declarations and makes the merged resources available to tests and
later hooks.

The helper keeps Vitest module isolation enabled and rejects `isolate: false`. It preserves
`vitest.maxWorkers` and does not rewrite command-line worker options.

## Jest

Jest 30 uses `globalSetup` and `globalTeardown` for shared resources. Jest cannot directly share
global-setup values with test suites, so the adapter writes only serializable resources to a
permission-restricted temporary JSON file and exposes its path to test processes.
`setupFilesAfterEnv` installs the package's file hook before the consumer application setup. The
file hook owns dedicated startup, merged resource access, application shutdown, and file cleanup.

Runner transforms remain the consumer's responsibility and can be passed through the `jest`
property. `jest.maxWorkers` and command-line worker settings are preserved.

## Resource timing

`injectedContainerResources()` is available from consumer `beforeAll`, tests, and later hooks.
Calling it during module collection fails with an actionable error because dedicated resources do
not exist until the package-owned `beforeAll` runs.

## IDE execution

Configure the IDE runner to use the same integration config used by the command line. Running an
individual annotated file without its global setup cannot work because no owner has started its
shared containers. In WebStorm, select the Vitest or Jest configuration file rather than relying
on automatic project discovery.

## Cucumber and other runners

Cucumber and Node's test runner can use `ContainerRuntime` or `IntegrationEnvironment` directly in
their global hooks. File-dedicated lifecycle automation is currently provided by the Jest and
Vitest adapters; another runner can model the same ownership with one runtime per file or scenario.

## Scope choices

| Desired scope | Configuration | Result |
| --- | --- | --- |
| Shared service | `rabbitMq({ isolation: 'shared' })` | One named RabbitMQ instance and global network for all declaring files |
| File-dedicated service | `postgreSql({ isolation: 'dedicated' })` | One named PostgreSQL instance per matched file |
| Multiple databases | Use distinct keys such as `primaryDatabase` and `auditDatabase` | Independent typed resources and name-based environment bindings |
| One direct suite | Create `ContainerRuntime` in suite hooks | Infrastructure owned by that suite |
| One Cucumber execution | Create a runtime in global Cucumber hooks | Infrastructure shared by scenarios |

Dedicated isolation is per file, not per test. Tests within one file still need transactions,
unique data, or cleanup for shared mutable state. More concurrently executing files can start more
dedicated containers, so the runner's worker count remains the developer's explicit capacity
control.
