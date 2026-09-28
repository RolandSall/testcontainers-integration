import {
  emitDashboardEventFor,
  emitDashboardEventForEverySession,
  flushDashboardEvents,
} from '../dashboard/dashboard-context.js';

/** Internal reporter that forwards Jest file and test-case activity to the local dashboard. */
export default class IntegrationDashboardJestReporter {
  private readonly reportedTests = new Set<string>();

  onRunStart(): void {
    emitDashboardEventForEverySession({
      type: 'run.started', runner: 'jest', status: 'running', scope: 'runner',
      message: 'Jest run started',
    });
  }

  onTestFileStart(test: Test): void {
    emitDashboardEventFor(test.path, {
      type: 'file.started', runner: 'jest', status: 'running', scope: 'file',
      message: 'test file started', filePath: test.path,
    });
  }

  onTestCaseStart(test: Test, testCase: { readonly fullName: string }): void {
    emitDashboardEventFor(test.path, {
      type: 'test.started', runner: 'jest', status: 'running', scope: 'test',
      message: 'test case started', filePath: test.path,
      testId: `${test.path}:${testCase.fullName}`, testName: testCase.fullName,
    });
  }

  onTestCaseResult(test: Test, testCase: TestCaseResult): void {
    const testId = `${test.path}:${testCase.fullName}`;
    this.reportedTests.add(testId);
    emitDashboardEventFor(test.path, {
      type: 'test.finished', runner: 'jest', status: normalizeStatus(testCase.status), scope: 'test',
      message: `test case ${testCase.status}`, filePath: test.path,
      testId, testName: testCase.fullName,
      ...(testCase.duration == null ? {} : { durationMs: testCase.duration }),
      ...(testCase.failureMessages.length === 0 ? {} : { error: testCase.failureMessages[0] }),
    });
  }

  onTestFileResult(test: Test, result: TestResult): void {
    for (const testCase of result.testResults) {
      const testId = `${test.path}:${testCase.fullName}`;
      if (this.reportedTests.has(testId)) continue;
      this.reportedTests.add(testId);
      emitDashboardEventFor(test.path, {
        type: 'test.finished', runner: 'jest', status: normalizeStatus(testCase.status), scope: 'test',
        message: `test case ${testCase.status}`, filePath: test.path,
        testId, testName: testCase.fullName,
        ...(testCase.duration == null ? {} : { durationMs: testCase.duration }),
        ...(testCase.failureMessages.length === 0 ? {} : { error: testCase.failureMessages[0] }),
      });
    }
    const failed = result.numFailingTests > 0 || result.testExecError !== undefined;
    const skipped = result.numPassingTests === 0 && result.numFailingTests === 0;
    emitDashboardEventFor(test.path, {
      type: 'file.finished', runner: 'jest',
      status: failed ? 'failed' : skipped ? 'skipped' : 'passed', scope: 'file',
      message: `test file ${failed ? 'failed' : skipped ? 'skipped' : 'passed'}`,
      filePath: test.path,
      ...(test.duration === undefined ? {} : { durationMs: test.duration }),
      ...(result.testExecError?.message === undefined ? {} : { error: result.testExecError.message }),
    });
  }

  async onRunComplete(
    _contexts: Set<unknown>,
    results: AggregatedResult,
  ): Promise<void> {
    emitDashboardEventForEverySession({
      type: 'run.finished', runner: 'jest',
      status: results.success ? 'passed' : 'failed', scope: 'runner',
      message: `Jest run ${results.success ? 'passed' : 'failed'}`,
      durationMs: Math.max(0, results.runExecError === undefined
        ? Date.now() - results.startTime
        : Date.now() - results.startTime),
      ...(results.runExecError?.message === undefined ? {} : { error: results.runExecError.message }),
    });
    await flushDashboardEvents();
  }
}

const normalizeStatus = (
  status: TestCaseResult['status'],
): 'passed' | 'failed' | 'skipped' => {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  return 'skipped';
};

interface Test {
  readonly path: string;
  readonly duration?: number;
}

interface TestCaseResult {
  readonly fullName: string;
  readonly status: 'passed' | 'failed' | 'pending' | 'todo' | 'disabled' | 'skipped';
  readonly duration?: number | null;
  readonly failureMessages: readonly string[];
}

interface TestResult {
  readonly numFailingTests: number;
  readonly numPassingTests: number;
  readonly testExecError?: Readonly<{ message?: string }>;
  readonly testResults: readonly TestCaseResult[];
}

interface AggregatedResult {
  readonly success: boolean;
  readonly startTime: number;
  readonly runExecError?: Readonly<{ message?: string }>;
}
