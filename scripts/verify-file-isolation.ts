import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface FixtureRun {
  readonly suite: string;
  readonly command: string;
  readonly arguments: readonly string[];
}

interface FileReport {
  readonly suite: string;
  readonly file: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly rabbitPort: number;
  readonly primaryPort: number;
  readonly auditPort: number;
  readonly primaryValue: string;
  readonly auditValue: string;
  readonly receivedMessage: string;
}

const workspaceRoot = process.cwd();
const binary = (name: string): string => resolve(workspaceRoot, 'node_modules', '.bin', name);
const runs: readonly FixtureRun[] = [
  {
    suite: 'vitest-annotation',
    command: binary('vitest'),
    arguments: ['run', '--config', 'runner-tests/file-isolation/vitest.annotation.config.ts'],
  },
  {
    suite: 'jest-annotation',
    command: binary('jest'),
    arguments: ['--config', 'runner-tests/file-isolation/jest.annotation.config.ts'],
  },
  {
    suite: 'vitest-project',
    command: binary('vitest'),
    arguments: ['run', '--config', 'runner-tests/file-isolation/vitest.project.config.ts'],
  },
  {
    suite: 'jest-project',
    command: binary('jest'),
    arguments: ['--config', 'runner-tests/file-isolation/jest.project.config.ts'],
  },
];

const runFixture = (
  run: FixtureRun,
  reportPath: string,
): ReturnType<typeof spawnSync> => {
  const result = spawnSync(run.command, run.arguments, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FILE_ISOLATION_SUITE: run.suite,
      FILE_ISOLATION_REPORT: reportPath,
    },
    timeout: 900_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result;
};

const readReports = (path: string): readonly FileReport[] => readFileSync(path, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as FileReport);

const verifyReports = (suite: string, reports: readonly FileReport[]): void => {
  if (reports.length !== 2 || new Set(reports.map(({ file }) => file)).size !== 2) {
    throw new Error(`${suite} did not report exactly two distinct test files`);
  }
  const overlapStarted = Math.max(...reports.map(({ startedAt }) => startedAt));
  const overlapEnded = Math.min(...reports.map(({ completedAt }) => completedAt));
  if (overlapStarted > overlapEnded) {
    throw new Error(`${suite} test files did not overlap in execution`);
  }
  if (new Set(reports.map(({ rabbitPort }) => rabbitPort)).size !== 1) {
    throw new Error(`${suite} did not share one RabbitMQ mapped port`);
  }
  if (new Set(reports.map(({ primaryPort }) => primaryPort)).size !== 2) {
    throw new Error(`${suite} did not allocate one primary PostgreSQL port per file`);
  }
  if (new Set(reports.map(({ auditPort }) => auditPort)).size !== 2) {
    throw new Error(`${suite} did not allocate one audit PostgreSQL port per file`);
  }
  for (const report of reports) {
    if (report.primaryPort === report.auditPort) {
      throw new Error(`${suite} ${report.file} reused one port for two named databases`);
    }
    const expectedValue = `saved-by-${suite}-${report.file}`;
    const expectedMessage = `message-from-${suite}-${report.file}`;
    if (report.primaryValue !== expectedValue || report.auditValue !== expectedValue) {
      throw new Error(`${suite} ${report.file} did not read its inserted database rows`);
    }
    if (report.receivedMessage !== expectedMessage) {
      throw new Error(`${suite} ${report.file} did not receive its RabbitMQ message`);
    }
    if ('worker' in report || 'workerId' in report) {
      throw new Error(`${suite} selected resources with a runner worker identifier`);
    }
  }
  console.log(
    `${suite}: files overlapped for ${overlapEnded - overlapStarted}ms; shared RabbitMQ ${reports[0]?.rabbitPort}; dedicated PostgreSQL ${reports.map(({ primaryPort, auditPort }) => `${primaryPort}/${auditPort}`).join(', ')}`,
  );
};

const verifyBootstrapFailureCleanup = (directory: string): void => {
  const before = dockerResources();
  const reportPath = join(directory, 'bootstrap-failure.json');
  const run: FixtureRun = {
    suite: 'vitest-bootstrap-failure',
    command: binary('vitest'),
    arguments: ['run', '--config', 'runner-tests/file-isolation/vitest.failure.config.ts'],
  };
  const result = spawnSync(run.command, run.arguments, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FILE_ISOLATION_FAILURE_REPORT: reportPath,
    },
    timeout: 900_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${result.stdout}${result.stderr}`;
  process.stdout.write(output);
  if (result.status === 0 || !output.includes('expected application bootstrap failure')) {
    throw new Error('The bootstrap-failure fixture did not fail for the expected reason');
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
  if (report.sideEffectCompleted !== true || report.stopWasCalled === true) {
    throw new Error('The bootstrap-failure fixture did not prove the expected partial startup');
  }
  waitForDockerCleanup(before, 'Bootstrap-failure fixture');
  console.log('bootstrap failure: side effect completed and containers/networks were cleaned');
};

const runForcedTerminationTest = (): void => {
  const result = spawnSync('node', [
    '--test',
    'runner-tests/file-isolation/termination/forced-termination.verifier.test.ts',
  ], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 900_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error('The forced-termination runner suite failed');
  }
};

const dockerResources = (): string => {
  const containers = docker(['ps', '-aq', '--filter', 'label=org.testcontainers']);
  const networks = docker(['network', 'ls', '-q', '--filter', 'label=org.testcontainers']);
  return `${containers}\n--networks--\n${networks}`;
};

const docker = (arguments_: readonly string[]): string => {
  const result = spawnSync('docker', arguments_, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Docker inspection failed: ${result.stderr}`);
  }
  return result.stdout.trim().split('\n').filter(Boolean).sort().join('\n');
};

const waitForDockerCleanup = (expected: string, fixture: string, timeoutMs = 30_000): void => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (dockerResources() === expected) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`${fixture} left Testcontainers containers or networks behind`);
};

const main = (): void => {
  const reportDirectory = mkdtempSync(join(tmpdir(), 'integration-file-isolation-'));
  try {
    for (const run of runs) {
      const reportPath = join(reportDirectory, `${run.suite}.jsonl`);
      const result = runFixture(run, reportPath);
      if (result.status !== 0) {
        throw new Error(`${run.suite} file-isolation fixture failed`);
      }
      verifyReports(run.suite, readReports(reportPath));
    }
    verifyBootstrapFailureCleanup(reportDirectory);
    runForcedTerminationTest();
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
  console.log('Jest and Vitest annotation and project file-isolation fixtures passed');
};

main();
