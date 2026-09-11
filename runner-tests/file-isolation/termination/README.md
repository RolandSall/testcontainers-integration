# Forced-termination test

This directory contains one actual verifier test and two child-process fixtures.

| File | Role |
| --- | --- |
| [`forced-termination.verifier.test.ts`](./forced-termination.verifier.test.ts) | The real Vitest test. It starts a child Vitest process, asserts that the database side effect and Docker resources exist, sends `SIGKILL`, asserts that application `stop()` did not run, and waits for Ryuk cleanup. |
| [`application.setup.ts`](./application.setup.ts) | Application fixture loaded inside the child process. It writes and reads a PostgreSQL row, signals the parent test, and leaves startup pending. |
| [`startup.termination.file-isolation.test.ts`](./startup.termination.file-isolation.test.ts) | A sentinel that gives the child Vitest process a test file to collect. Its body must remain unreachable because application startup hangs first. |

The processes are deliberately separate:

```text
Parent Vitest verifier test
  -> starts child Vitest process
  -> child starts shared and dedicated containers
  -> child application performs a database side effect and hangs
  -> parent asserts the resources exist
  -> parent kills the child process
  -> parent asserts Testcontainers eventually removes the resources
```

Run only this test with:

```sh
bun run test:termination-cleanup:docker
```
