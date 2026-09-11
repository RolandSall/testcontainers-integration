# Runner test suites

These suites verify the library from the perspective of Jest and Vitest consumers. They are repository-only test fixtures and are not included in the published npm package.

## Directory map

| Directory | Kind | What it verifies | Command |
| --- | --- | --- | --- |
| [`jest`](./jest) | Private workspace package | Jest 30 can load the built CommonJS-compatible adapter, scan an annotated file, provide shared resources to application setup, and leave an unannotated file untouched. It uses fake containers and a fake network, so Docker is not required. | `bun run test:runners` |
| [`vitest`](./vitest) | Private workspace package | Vitest 4 can load the built ESM adapter and provides the same annotated and unannotated lifecycle behavior. It also uses fake containers and does not require Docker. | `bun run test:runners` |
| [`file-isolation`](./file-isolation) | Cross-runner Docker fixtures | Real Jest and Vitest processes receive shared and file-dedicated PostgreSQL and RabbitMQ resources, including parallel execution and failure cleanup. | `bun run test:file-isolation:docker` |

The Jest and Vitest directories have `private: true` package manifests so they behave like small consumer projects with runner-specific dependency and module settings. They are not release packages and cannot be published accidentally. The file-isolation directory is not a package because one root verifier coordinates several runner processes and inspects their Docker resources.

## Fast runner contract tests

[`jest`](./jest) and [`vitest`](./vitest) each cover two files:

- `required-container.runner.test.ts` declares a shared fake SQL Server container and verifies that the application lifecycle receives its mapped resource.
- `unannotated.runner.test.ts` verifies that an ordinary test file does not start an application or request infrastructure.

These tests answer whether each runner adapter loads and wires lifecycle hooks correctly. They do not prove that Docker images start or that parallel files receive isolated infrastructure.

## Real file-isolation fixtures

[`file-isolation`](./file-isolation) contains the Docker-backed behavioral matrix:

| Fixture | What it proves |
| --- | --- |
| [`jest-annotation`](./file-isolation/jest-annotation) | Two concurrent annotated Jest files share RabbitMQ and receive separate primary and audit PostgreSQL containers. |
| [`vitest-annotation`](./file-isolation/vitest-annotation) | The same annotation behavior under Vitest. |
| [`jest-project`](./file-isolation/jest-project) | The same shared and dedicated behavior using Jest project configuration instead of annotations. |
| [`vitest-project`](./file-isolation/vitest-project) | The same project-configuration behavior under Vitest. |
| [`failure`](./file-isolation/failure) | A real database side effect occurs before application bootstrap rejects, after which normal in-process cleanup removes file-owned resources and global teardown removes shared resources. |
| [`termination`](./file-isolation/termination) | One runner-neutral Node.js test applies the same side-effect, `SIGKILL`, and resource-cleanup assertions to separate Vitest and Jest child processes. |
| [`support`](./file-isolation/support) | Shared backend, application setup, reporting, PostgreSQL assertions, and RabbitMQ assertions used by the four parallel runner fixtures. |

The four runner configurations are kept at the root of `file-isolation` so the complete matrix is visible together:

- [`jest.annotation.config.ts`](./file-isolation/jest.annotation.config.ts)
- [`jest.project.config.ts`](./file-isolation/jest.project.config.ts)
- [`vitest.annotation.config.ts`](./file-isolation/vitest.annotation.config.ts)
- [`vitest.project.config.ts`](./file-isolation/vitest.project.config.ts)

The normal rejection and forced-termination configurations are:

- [`vitest.failure.config.ts`](./file-isolation/vitest.failure.config.ts)
- [`vitest.termination-child.config.ts`](./file-isolation/vitest.termination-child.config.ts) configures the child process that is deliberately killed.
- [`jest.termination-child.config.ts`](./file-isolation/jest.termination-child.config.ts) configures the equivalent Jest child process.

## Related verification boundaries

- Package unit tests live beside production source in [`packages/testcontainers-integration/src`](../packages/testcontainers-integration/src).
- Developer-facing runnable applications live in [`examples`](../examples).
- Packed npm consumer verification is created temporarily by [`scripts/verify-packages.ts`](../scripts/verify-packages.ts), outside the workspace dependency graph.
- Built-in adapter smoke tests using real Docker live in [`built-in-containers.docker.test.ts`](../packages/testcontainers-integration/src/built-in-containers.docker.test.ts).

Keeping these boundaries separate prevents examples from becoming test-only abstractions and prevents runner wiring tests from being mistaken for published packages.
