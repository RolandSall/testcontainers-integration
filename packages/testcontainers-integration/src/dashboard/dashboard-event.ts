export type DashboardRunner = 'jest' | 'vitest';
export type DashboardStatus =
  | 'starting'
  | 'running'
  | 'ready'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'stopping'
  | 'stopped';

/** Safe structured event rendered by the local integration-test dashboard. */
export interface DashboardEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly runner?: DashboardRunner;
  readonly status?: DashboardStatus;
  readonly scope?: string;
  readonly message?: string;
  readonly filePath?: string;
  readonly testId?: string;
  readonly testName?: string;
  readonly containerName?: string;
  readonly containerKind?: string;
  readonly isolation?: 'shared' | 'dedicated';
  readonly image?: string;
  readonly containerId?: string;
  readonly mappedPorts?: Readonly<Record<string, number>>;
  readonly durationMs?: number;
  readonly error?: string;
}

export type DashboardEventInput = Omit<DashboardEvent, 'timestamp'> & {
  readonly timestamp?: number;
};

/** Receives non-secret lifecycle events without owning their transport. */
export interface IntegrationTestEventSink {
  emit(event: DashboardEventInput): void;
}

export const normalizeDashboardEvent = (
  event: DashboardEventInput,
): DashboardEvent => ({
  ...event,
  timestamp: event.timestamp ?? Date.now(),
});

export const dashboardErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'A non-Error value was thrown';
