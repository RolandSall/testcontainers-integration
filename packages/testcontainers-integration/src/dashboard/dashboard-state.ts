import type { DashboardEvent, DashboardStatus } from './dashboard-event.js';

export interface DashboardSummary {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly containers: number;
  readonly peakFileParallelism: number;
}

/** Reduces the append-only event stream into stable summary metrics. */
export const reduceDashboardSummary = (
  events: readonly DashboardEvent[],
): DashboardSummary => {
  const completedTests = events.filter(({ type }) => type === 'test.finished');
  const containerKeys = new Set(
    events
      .filter(({ type, containerName }) => type === 'container.ready' && containerName !== undefined)
      .map(containerIdentity),
  );
  const activeFiles = new Set<string>();
  let peakFileParallelism = 0;
  for (const event of events) {
    if (event.type === 'file.started' && event.filePath !== undefined) {
      activeFiles.add(event.filePath);
      peakFileParallelism = Math.max(peakFileParallelism, activeFiles.size);
    }
    if (event.type === 'file.finished' && event.filePath !== undefined) {
      activeFiles.delete(event.filePath);
    }
  }
  return {
    tests: completedTests.length,
    passed: countStatus(completedTests, 'passed'),
    failed: countStatus(completedTests, 'failed'),
    skipped: countStatus(completedTests, 'skipped'),
    containers: containerKeys.size,
    peakFileParallelism,
  };
};

const countStatus = (
  events: readonly DashboardEvent[],
  status: DashboardStatus,
): number => events.filter((event) => event.status === status).length;

const containerIdentity = (event: DashboardEvent): string => [
  event.containerName,
  event.isolation ?? 'unknown',
  event.isolation === 'dedicated' ? event.filePath ?? 'unknown' : 'shared',
].join('|');
