import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

interface TerminationReport {
  readonly sideEffectCompleted: boolean;
  readonly dedicatedPort: number;
  readonly sharedPort: number;
}

interface DockerResourceSets {
  readonly containers: ReadonlySet<string>;
  readonly networks: ReadonlySet<string>;
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

const verifyForcedTerminationCleanup = async (directory: string): Promise<void> => {
  const before = dockerResourceSets();
  const expectedResources = serializeDockerResources(before);
  const signalPath = join(directory, 'termination-signal.json');
  const stopPath = join(directory, 'termination-stop.txt');
  let output = '';
  const child = spawn(binary('vitest'), [
    'run',
    '--config',
    'runner-tests/file-isolation/vitest.termination.config.ts',
  ], {
    cwd: workspaceRoot,
    detached: true,
    env: {
      ...process.env,
      FILE_ISOLATION_TERMINATION_SIGNAL: signalPath,
      FILE_ISOLATION_TERMINATION_STOP: stopPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { output += chunk; });
  const exited = new Promise<void>((resolveExit, rejectExit) => {
    child.once('exit', () => resolveExit());
    child.once('error', rejectExit);
  });

  try {
    await waitForFile(signalPath, child, () => output);
    const report = JSON.parse(readFileSync(signalPath, 'utf8')) as TerminationReport;
    if (!report.sideEffectCompleted) {
      throw new Error('The forced-termination fixture did not complete its database side effect');
    }
    if (report.sharedPort === report.dedicatedPort) {
      throw new Error('The forced-termination fixture did not start distinct shared and dedicated containers');
    }

    const running = dockerResourceSets();
    const startedContainers = difference(running.containers, before.containers);
    const startedNetworks = difference(running.networks, before.networks);
    if (startedContainers.length < 2 || startedNetworks.length < 2) {
      throw new Error(
        `The forced-termination fixture exposed ${startedContainers.length} new containers and ${startedNetworks.length} new networks; expected at least two of each`,
      );
    }

    killProcessGroup(child.pid);
    await waitForExit(exited);
    process.stdout.write(output);
    if (existsSync(stopPath)) {
      throw new Error('Application stop unexpectedly ran after the runner was killed');
    }
    waitForDockerCleanup(expectedResources, 'Forced-termination fixture', 90_000);
    console.log(
      `forced termination: database side effect completed; ${startedContainers.length} containers and ${startedNetworks.length} networks were reaped after SIGKILL`,
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      killProcessGroup(child.pid);
      await waitForExit(exited).catch(() => undefined);
    }
  }
};

const dockerResources = (): string => {
  return serializeDockerResources(dockerResourceSets());
};

const dockerResourceSets = (): DockerResourceSets => ({
  containers: new Set(lines(docker(['ps', '-aq', '--filter', 'label=org.testcontainers']))),
  networks: new Set(lines(docker(['network', 'ls', '-q', '--filter', 'label=org.testcontainers']))),
});

const serializeDockerResources = ({ containers, networks }: DockerResourceSets): string => [
  ...Array.from(containers).sort(),
  '--networks--',
  ...Array.from(networks).sort(),
].join('\n');

const lines = (value: string): readonly string[] => value.split('\n').filter(Boolean);

const difference = (current: ReadonlySet<string>, previous: ReadonlySet<string>): readonly string[] =>
  Array.from(current).filter((value) => !previous.has(value));

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

const waitForFile = async (
  path: string,
  child: ReturnType<typeof spawn>,
  output: () => string,
): Promise<void> => {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The forced-termination fixture exited before reaching the hang:\n${output()}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`The forced-termination fixture did not reach the hang:\n${output()}`);
};

const killProcessGroup = (pid: number | undefined): void => {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    process.kill(pid, 'SIGKILL');
  }
};

const waitForExit = async (exited: Promise<void>): Promise<void> => {
  await Promise.race([
    exited,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('The forced-termination fixture process did not exit after SIGKILL')), 30_000);
    }),
  ]);
};

const main = async (): Promise<void> => {
  const reportDirectory = mkdtempSync(join(tmpdir(), 'integration-file-isolation-'));
  try {
    const terminationOnly = process.argv.includes('--termination-only');
    if (!terminationOnly) {
      for (const run of runs) {
        const reportPath = join(reportDirectory, `${run.suite}.jsonl`);
        const result = runFixture(run, reportPath);
        if (result.status !== 0) {
          throw new Error(`${run.suite} file-isolation fixture failed`);
        }
        verifyReports(run.suite, readReports(reportPath));
      }
      verifyBootstrapFailureCleanup(reportDirectory);
    }
    await verifyForcedTerminationCleanup(reportDirectory);
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
  console.log(
    process.argv.includes('--termination-only')
      ? 'Forced-termination cleanup fixture passed'
      : 'Jest and Vitest annotation and project file-isolation fixtures passed',
  );
};

await main();
