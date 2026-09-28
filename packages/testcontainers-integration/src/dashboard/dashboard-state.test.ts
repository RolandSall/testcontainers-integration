import { expect, test } from 'vitest';
import { normalizeDashboardEvent } from './dashboard-event.js';
import { reduceDashboardSummary } from './dashboard-state.js';

test('reduces test counts, dedicated container identities, and peak file parallelism', () => {
  const events = [
    normalizeDashboardEvent({ type: 'file.started', filePath: '/a.test.ts' }),
    normalizeDashboardEvent({ type: 'file.started', filePath: '/b.test.ts' }),
    normalizeDashboardEvent({
      type: 'container.ready', containerName: 'database', isolation: 'dedicated',
      filePath: '/a.test.ts',
    }),
    normalizeDashboardEvent({
      type: 'container.ready', containerName: 'database', isolation: 'dedicated',
      filePath: '/b.test.ts',
    }),
    normalizeDashboardEvent({
      type: 'container.ready', containerName: 'messages', isolation: 'shared',
    }),
    normalizeDashboardEvent({ type: 'test.finished', status: 'passed' }),
    normalizeDashboardEvent({ type: 'test.finished', status: 'failed' }),
    normalizeDashboardEvent({ type: 'test.finished', status: 'skipped' }),
    normalizeDashboardEvent({ type: 'file.finished', filePath: '/a.test.ts' }),
    normalizeDashboardEvent({ type: 'file.finished', filePath: '/b.test.ts' }),
  ];

  expect(reduceDashboardSummary(events)).toEqual({
    tests: 3,
    passed: 1,
    failed: 1,
    skipped: 1,
    containers: 3,
    peakFileParallelism: 2,
  });
});
