# Forced-termination test

This directory contains one runner-neutral verifier test and runner-specific child-process fixtures.

| File | Role |
| --- | --- |
| [`forced-termination.verifier.test.ts`](./forced-termination.verifier.test.ts) | The real Node.js test. It runs the same assertions against separate Vitest and Jest child processes. |
| [`application-lifecycle.ts`](./application-lifecycle.ts) | Shared application behavior used by both child runners. It writes and reads a PostgreSQL row, signals the parent test, and leaves startup pending. |
| [`application.vitest.setup.ts`](./application.vitest.setup.ts) | Installs the shared application behavior into the Vitest lifecycle adapter. |
| [`application.jest.setup.ts`](./application.jest.setup.ts) | Installs the shared application behavior into the Jest lifecycle adapter. |
| [`vitest-child.sentinel.test.ts`](./vitest-child.sentinel.test.ts) | Gives the Vitest child a test file to collect. Its body must remain unreachable because application startup hangs first. |
| [`jest-child.sentinel.test.ts`](./jest-child.sentinel.test.ts) | Provides the equivalent sentinel for the Jest child. |

The processes are deliberately separate:

```text
Parent Node.js verifier test
  -> runs the scenario with a Vitest child
  -> runs the same scenario with a Jest child
  -> each child starts shared and dedicated containers
  -> each child performs a database side effect and hangs
  -> parent asserts that child's resources exist
  -> parent kills that child process
  -> parent asserts Testcontainers removes those exact resources
```

Run only this test with:

```sh
bun run test:termination-cleanup:docker
```
