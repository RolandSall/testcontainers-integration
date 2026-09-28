import type { Reporter } from 'vitest/reporters';
import {
  emitDashboardEventFor,
  emitDashboardEventForEverySession,
  flushDashboardEvents,
} from '../dashboard/dashboard-context.js';

/** Internal reporter that forwards Vitest file and test-case activity to the local dashboard. */
export default class IntegrationDashboardVitestReporter implements Reporter {
  onTestRunStart(): void {
    emitDashboardEventForEverySession({
      type: 'run.started', runner: 'vitest', status: 'running', scope: 'runner',
      message: 'Vitest run started',
    });
  }

  onTestModuleStart(testModule: TestModule): void {
    emitDashboardEventFor(testModule.moduleId, {
      type: 'file.started', runner: 'vitest', status: 'running', scope: 'file',
      message: 'test file started', filePath: testModule.moduleId,
    });
  }

  onTestModuleEnd(testModule: TestModule): void {
    const state = testModule.state();
    emitDashboardEventFor(testModule.moduleId, {
      type: 'file.finished', runner: 'vitest', status: normalizeStatus(state), scope: 'file',
      message: `test file ${state}`, filePath: testModule.moduleId,
      durationMs: testModule.diagnostic().duration,
    });
  }

  onTestCaseReady(testCase: TestCase): void {
    emitDashboardEventFor(testCase.module.moduleId, {
      type: 'test.started', runner: 'vitest', status: 'running', scope: 'test',
      message: 'test case started', filePath: testCase.module.moduleId,
      testId: testCase.id, testName: testCase.fullName,
    });
  }

  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result();
    const diagnostic = testCase.diagnostic();
    emitDashboardEventFor(testCase.module.moduleId, {
      type: 'test.finished', runner: 'vitest', status: normalizeStatus(result.state), scope: 'test',
      message: `test case ${result.state}`, filePath: testCase.module.moduleId,
      testId: testCase.id, testName: testCase.fullName,
      ...(diagnostic === undefined ? {} : { durationMs: diagnostic.duration }),
      ...(result.state === 'failed' && result.errors[0] !== undefined
        ? { error: result.errors[0].message }
        : {}),
    });
  }

  async onTestRunEnd(
    _testModules: ReadonlyArray<TestModule>,
    _unhandledErrors: ReadonlyArray<unknown>,
    reason: 'passed' | 'interrupted' | 'failed',
  ): Promise<void> {
    emitDashboardEventForEverySession({
      type: 'run.finished', runner: 'vitest',
      status: reason === 'passed' ? 'passed' : 'failed', scope: 'runner',
      message: `Vitest run ${reason}`,
    });
    await flushDashboardEvents();
  }
}

type TestCase = Parameters<NonNullable<Reporter['onTestCaseReady']>>[0];
type TestModule = Parameters<NonNullable<Reporter['onTestModuleStart']>>[0];

const normalizeStatus = (
  status: 'queued' | 'pending' | 'passed' | 'failed' | 'skipped',
): 'running' | 'passed' | 'failed' | 'skipped' => {
  if (status === 'queued' || status === 'pending') return 'running';
  return status;
};
