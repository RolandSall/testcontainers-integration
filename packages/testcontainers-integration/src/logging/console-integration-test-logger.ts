import type { IntegrationTestLogger } from './integration-test-logger.js';

/** Writes UTC timestamped integration events to standard output and error. */
export class ConsoleIntegrationTestLogger implements IntegrationTestLogger {
  /** Creates a logger with an injectable clock for deterministic tests. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Writes one timestamped informational line to standard output. */
  info(scope: string, message: string): void {
    process.stdout.write(`${this.format(scope, message)}\n`);
  }

  /** Writes a timestamped failure and error detail to standard error. */
  error(scope: string, message: string, error?: unknown): void {
    const formatted = this.format(scope, message);
    if (error === undefined) {
      process.stderr.write(`${formatted}\n`);
      return;
    }
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : 'A non-Error value was thrown';
    process.stderr.write(`${formatted}\n${detail}\n`);
  }

  private format(scope: string, message: string): string {
    return `[${this.now().toISOString()}] [integration:${scope}] ${message}`;
  }
}

/** Shared default logger used when callers do not provide another implementation. */
export const consoleIntegrationTestLogger = new ConsoleIntegrationTestLogger();
