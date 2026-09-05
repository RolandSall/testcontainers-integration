/** Receives scoped integration-test lifecycle and diagnostic events. */
export interface IntegrationTestLogger {
  /** Records an informational event without sensitive connection data. */
  info(scope: string, message: string): void;
  /** Records a failed lifecycle event and its optional cause. */
  error(scope: string, message: string, error?: unknown): void;
}
