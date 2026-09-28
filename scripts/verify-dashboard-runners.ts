import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Runner = 'jest' | 'vitest';
type Fixture = 'passing' | 'failing';

const workspaceRoot = process.cwd();
const outputRoot = resolve(workspaceRoot, 'test-results', 'dashboard-runner-fixtures');

const run = (runner: Runner, fixture: Fixture): void => {
  const executable = resolve(workspaceRoot, 'node_modules', '.bin', runner);
  const config = `runner-tests/dashboard/${runner}.config.ts`;
  const arguments_ = runner === 'vitest'
    ? ['run', '--config', config]
    : ['--config', config];
  const result = spawnSync(executable, arguments_, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, DASHBOARD_FIXTURE_KIND: fixture },
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if ((fixture === 'passing' && result.status !== 0) || (fixture === 'failing' && result.status === 0)) {
    throw new Error(`${runner} ${fixture} dashboard fixture returned an unexpected exit code`);
  }

  const report = newestReport(resolve(outputRoot, `${runner}-${fixture}`));
  const html = readFileSync(report, 'utf8');
  const expected = fixture === 'passing'
    ? ['dashboard records a passing test', 'dashboard records a parallel file', 'dashboard records a skipped test']
    : ['dashboard records an intentional failure'];
  for (const name of expected) {
    if (!html.includes(name)) throw new Error(`${runner} report is missing test: ${name}`);
  }
  for (const event of ['test.finished', 'file.finished', 'dashboard.stopped']) {
    if (!html.includes(event)) throw new Error(`${runner} report is missing ${event}`);
  }
  if (html.includes('writeToken') || html.includes('INTEGRATION_TESTING_DASHBOARD_SESSIONS')) {
    throw new Error(`${runner} report exposed dashboard transport credentials`);
  }
  console.log(`${runner} ${fixture}: verified ${report}`);
};

const newestReport = (directory: string): string => {
  if (!existsSync(directory)) throw new Error(`Dashboard output directory was not created: ${directory}`);
  const candidates = readdirSync(directory)
    .map((name) => join(directory, name, 'index.html'))
    .filter(existsSync)
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  const report = candidates[0];
  if (report === undefined) throw new Error(`Dashboard report was not generated under ${directory}`);
  return report;
};

rmSync(outputRoot, { recursive: true, force: true });
for (const runner of ['vitest', 'jest'] as const) {
  run(runner, 'passing');
  run(runner, 'failing');
}
console.log('Jest and Vitest dashboard runner fixtures passed');
