import type { IntegrationTestLogger } from '../logging/integration-test-logger.js';
import { dashboardErrorMessage, type IntegrationTestEventSink } from './dashboard-event.js';

/** Mirrors existing lifecycle logging into the safe structured dashboard stream. */
export class DashboardIntegrationTestLogger implements IntegrationTestLogger {
  constructor(
    private readonly delegate: IntegrationTestLogger,
    private readonly events: IntegrationTestEventSink,
    private readonly filePath?: string,
  ) {}

  info(scope: string, message: string): void {
    this.delegate.info(scope, message);
    this.events.emit({
      type: 'log.info',
      scope,
      message,
      ...(this.filePath === undefined ? {} : { filePath: this.filePath }),
    });
  }

  error(scope: string, message: string, error?: unknown): void {
    this.delegate.error(scope, message, error);
    this.events.emit({
      type: 'log.error',
      status: 'failed',
      scope,
      message,
      ...(error === undefined ? {} : { error: dashboardErrorMessage(error) }),
      ...(this.filePath === undefined ? {} : { filePath: this.filePath }),
    });
  }

  /** Creates a logger that keeps opt-in output correlated without duplicating it in lifecycle logs. */
  forContainer(
    containerName: string,
    containerKind: string,
    isolation?: 'shared' | 'dedicated',
  ): IntegrationTestLogger {
    return {
      info: (scope, message) => {
        this.delegate.info(scope, message);
        this.events.emit({
          type: 'container.log',
          scope: 'container-output',
          message,
          containerName,
          containerKind,
          ...(isolation === undefined ? {} : { isolation }),
          ...(this.filePath === undefined ? {} : { filePath: this.filePath }),
        });
      },
      error: (scope, message, error) => {
        this.delegate.error(scope, message, error);
        this.events.emit({
          type: 'container.log',
          status: 'failed',
          scope: 'container-output',
          message,
          containerName,
          containerKind,
          ...(isolation === undefined ? {} : { isolation }),
          ...(error === undefined ? {} : { error: dashboardErrorMessage(error) }),
          ...(this.filePath === undefined ? {} : { filePath: this.filePath }),
        });
      },
    };
  }
}
