# Runner lifecycle

## Annotation mode

Both adapters can configure built-in annotation discovery without consumer-owned global setup files:

```ts
import { defineAnnotationProject } from '@integration-testing/testcontainers/vitest';

export default defineAnnotationProject({
  application: './test/application.vitest.setup.ts',
  hookTimeout: 360_000,
  testTimeout: 30_000,
});
```

Import the Jest variant from `@integration-testing/testcontainers/jest` and pass ordinary Jest
options through its `jest` property. The helper owns scanner setup and container teardown. Use the
lower-level global lifecycle API when annotation discovery needs a custom container registry.

## Project configuration mode

Both adapters can own their setup and teardown from one serializable declaration:

```ts
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/vitest';

export default defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: postgreSql(), messages: rabbitMq() },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('database', 'connectionUri'),
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
    },
  },
});
```

Import the Jest variant from `@integration-testing/testcontainers/jest`. Both variants use the same
`ContainerRuntime`, resources, application contract, and reverse-order cleanup as annotation
mode. Keep explicit and annotation discovery in separate runner projects.

## Vitest

Vitest `globalSetup` discovers requirements and starts one shared runtime. It transfers only
serializable resources through `project.provide`. `setupFiles` registers file-level application
hooks, and `inject` restores typed resources in the worker.

In project configuration mode the package-owned global setup reads the serialized project declaration instead
of scanning test source. Named environment bindings are resolved after startup and installed
before worker setup files load. Existing values are restored during teardown.

`vitest.integration.config.ts` is consumer configuration, not library runtime code. It tells
Vitest which test files, global setup, and setup modules belong to the integration project.
Unit-test configuration should remain separate so unit tests never start Docker.

## Jest

Jest 30 uses `globalSetup` and `globalTeardown` for the shared runtime. Jest cannot directly
share global-setup values with test suites. The adapter writes resources to a generated
permission-restricted temporary JSON file and exposes only its path to workers.
`setupFilesAfterEnv` restores resources and registers application hooks.

In both annotation and project configuration modes, package-owned global setup and teardown are configured automatically.
Runner-specific transforms remain the consumer's responsibility and can be passed through the
`jest` property.

## IDE execution

Configure the IDE runner to use the same integration config file used by the command line.
Running an individual annotated file without its global setup cannot work because no owner has
started its containers. In WebStorm, select the Vitest or Jest configuration file in the run
configuration rather than relying on automatic project discovery.

The repository root and the Vitest annotation example both have a default-named `vitest.config.ts`
fallback. Together they support gutter runs whether WebStorm chooses the workspace or package as
its working directory. They are IDE conveniences for this checkout, not replacements for the
dedicated integration config that consuming applications should own.

## Cucumber and other runners

Cucumber does not need a package-specific adapter. Start `ContainerRuntime` or
`IntegrationEnvironment` in the global Cucumber lifecycle and stop it in the matching teardown.
Keep scenario state in the World and keep infrastructure ownership in the environment.

## Scope choices

| Desired scope | API | Result |
| --- | --- | --- |
| One command | Vitest or Jest global adapter | Shared across all discovered files |
| One suite | New `ContainerRuntime` in suite hooks | Shared inside that suite only |
| One Cucumber execution | New runtime in global Cucumber hooks | Shared by scenarios |
| Multiple isolated instances | Give each project container a distinct name | Separate adapters and named resources |

Per-test container startup and cross-command reuse are deferred. Database isolation should
normally use transactions, schemas, or databases on top of a run-scoped server container.
