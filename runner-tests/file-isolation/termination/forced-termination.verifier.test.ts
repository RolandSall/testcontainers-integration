import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

interface TerminationReport {
  readonly sideEffectCompleted: boolean;
  readonly dedicatedPort: number;
  readonly sharedPort: number;
}

interface DockerResourceSets {
  readonly containers: ReadonlySet<string>;
  readonly networks: ReadonlySet<string>;
}

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const vitest = resolve(workspaceRoot, 'node_modules', '.bin', 'vitest');

test('given bootstrap hangs after a side effect, when the runner is killed, then Docker resources are reaped', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'integration-forced-termination-'));
  const signalPath = join(directory, 'termination-signal.json');
  const stopPath = join(directory, 'termination-stop.txt');
  const before = dockerResourceSets();
  let output = '';
  const child = spawn(vitest, [
    'run',
    '--config',
    'runner-tests/file-isolation/vitest.termination-child.config.ts',
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
    await waitForSignal(signalPath, child, () => output);
    const report = JSON.parse(readFileSync(signalPath, 'utf8')) as TerminationReport;
    expect(report.sideEffectCompleted).toBe(true);
    expect(report.sharedPort).not.toBe(report.dedicatedPort);

    const running = dockerResourceSets();
    const startedContainers = difference(running.containers, before.containers);
    const startedNetworks = difference(running.networks, before.networks);
    expect(startedContainers.length).toBeGreaterThanOrEqual(2);
    expect(startedNetworks.length).toBeGreaterThanOrEqual(2);

    killProcessGroup(child.pid);
    await waitForExit(exited);

    expect(existsSync(stopPath)).toBe(false);
    expect(await waitForDockerCleanup(before, 90_000)).toBe(true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      killProcessGroup(child.pid);
      await waitForExit(exited).catch(() => undefined);
    }
    rmSync(directory, { recursive: true, force: true });
  }
}, 720_000);

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
  expected: DockerResourceSets,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = dockerResourceSets();
    if (
      setsEqual(current.containers, expected.containers)
      && setsEqual(current.networks, expected.networks)
    ) return true;
    await delay(250);
  }
  return false;
};

const setsEqual = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  left.size === right.size && Array.from(left).every((value) => right.has(value));

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
