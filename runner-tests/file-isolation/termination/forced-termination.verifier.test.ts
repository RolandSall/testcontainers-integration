import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

interface TerminationReport {
  readonly sideEffectCompleted: boolean;
  readonly dedicatedPort: number;
  readonly sharedPort: number;
}

interface DockerResourceSets {
  readonly containers: ReadonlySet<string>;
  readonly networks: ReadonlySet<string>;
}

interface RunnerCase {
  readonly name: string;
  readonly command: string;
  readonly arguments: readonly string[];
}

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const binary = (name: string): string => resolve(workspaceRoot, 'node_modules', '.bin', name);
const runnerCases: readonly RunnerCase[] = [
  {
    name: 'Vitest',
    command: binary('vitest'),
    arguments: [
      'run',
      '--config',
      'runner-tests/file-isolation/vitest.termination-child.config.ts',
    ],
  },
  {
    name: 'Jest',
    command: binary('jest'),
    arguments: [
      '--config',
      'runner-tests/file-isolation/jest.termination-child.config.ts',
    ],
  },
];

void test('forced runner termination reaps file-isolation resources', { timeout: 1_440_000 }, async (context) => {
  for (const runner of runnerCases) {
    await context.test(
      `${runner.name} is killed after a real database side effect`,
      { timeout: 720_000 },
      () => verifyForcedTermination(runner),
    );
  }
});

const verifyForcedTermination = async (runner: RunnerCase): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), `integration-${runner.name.toLowerCase()}-termination-`));
  const signalPath = join(directory, 'termination-signal.json');
  const stopPath = join(directory, 'termination-stop.txt');
  const before = dockerResourceSets();
  let output = '';
  const child = spawn(runner.command, runner.arguments, {
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
    await waitForSignal(signalPath, child, () => output);
    const report = JSON.parse(readFileSync(signalPath, 'utf8')) as TerminationReport;
    assert.equal(report.sideEffectCompleted, true, `${runner.name} did not complete the database side effect`);
    assert.notEqual(report.sharedPort, report.dedicatedPort, `${runner.name} reused one mapped port`);

    const running = dockerResourceSets();
    const startedContainers = difference(running.containers, before.containers);
    const startedNetworks = difference(running.networks, before.networks);
    assert.ok(startedContainers.length >= 2, `${runner.name} did not expose two fixture containers`);
    assert.ok(startedNetworks.length >= 2, `${runner.name} did not expose two fixture networks`);

    killProcessGroup(child.pid);
    await waitForExit(exited);

    assert.equal(existsSync(stopPath), false, `${runner.name} application stop ran after SIGKILL`);
    assert.equal(
      await waitForDockerCleanup(startedContainers, startedNetworks, 180_000),
      true,
      `${runner.name} left its fixture containers or networks behind`,
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      killProcessGroup(child.pid);
      await waitForExit(exited).catch(() => undefined);
    }
    rmSync(directory, { recursive: true, force: true });
  }
};

const dockerResourceSets = (): DockerResourceSets => ({
  containers: new Set(docker(['ps', '-aq', '--filter', 'label=org.testcontainers'])),
  networks: new Set(docker(['network', 'ls', '-q', '--filter', 'label=org.testcontainers'])),
});

const docker = (arguments_: readonly string[]): readonly string[] => {
  const result = spawnSync('docker', arguments_, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Docker inspection failed: ${result.stderr}`);
  }
  return result.stdout.trim().split('\n').filter(Boolean).sort();
};

const difference = (current: ReadonlySet<string>, previous: ReadonlySet<string>): readonly string[] =>
  Array.from(current).filter((value) => !previous.has(value));

const waitForSignal = async (
  path: string,
  child: ReturnType<typeof spawn>,
  output: () => string,
): Promise<void> => {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The child fixture exited before reaching the hang:\n${output()}`);
    }
    await delay(250);
  }
  throw new Error(`The child fixture did not reach the hang:\n${output()}`);
};

const waitForDockerCleanup = async (
  containerIds: readonly string[],
  networkIds: readonly string[],
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = dockerResourceSets();
    const containersRemain = containerIds.some((id) => current.containers.has(id));
    const networksRemain = networkIds.some((id) => current.networks.has(id));
    if (!containersRemain && !networksRemain) return true;
    await delay(250);
  }
  return false;
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
  await new Promise<void>((resolveExit, rejectExit) => {
    const timeout = setTimeout(
      () => rejectExit(new Error('The child fixture did not exit after SIGKILL')),
      30_000,
    );
    exited.then(
      () => {
        clearTimeout(timeout);
        resolveExit();
      },
      (error: unknown) => {
        clearTimeout(timeout);
        rejectExit(
          error instanceof Error
            ? error
            : new Error('The child fixture exit failed', { cause: error }),
        );
      },
    );
  });
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
