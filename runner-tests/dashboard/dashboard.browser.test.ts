import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDescriptorFor } from '../../packages/testcontainers-integration/src/dashboard/dashboard-context.ts';
import { DashboardSession } from '../../packages/testcontainers-integration/src/dashboard/dashboard-session.ts';

const chromeExecutable = process.env.DASHBOARD_CHROME_EXECUTABLE ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(existsSync);

void test('live and saved dashboards render updates, charts, failures, filtering, and empty states', {
  skip: chromeExecutable === undefined ? 'Chrome or Chromium is not installed' : false,
  timeout: 30_000,
}, async () => {
  if (chromeExecutable === undefined) return;
  const root = await mkdtemp(join(tmpdir(), 'integration-dashboard-browser-'));
  let browser: ChildProcess | undefined;
  let session: DashboardSession | undefined;
  try {
    const launched = await launchChrome(chromeExecutable, root);
    browser = launched.process;
    const devtools = launched.devtools;
    session = new DashboardSession(root, 'vitest', {
      open: false,
      outputDirectory: 'reports',
    });
    await session.start();
    const descriptor = dashboardDescriptorFor(join(root, 'parallel.dashboard.test.ts'));
    if (descriptor === undefined) throw new Error('Dashboard descriptor was not registered');

    await devtools.navigate(descriptor.dashboardUrl);
    await devtools.waitFor("document.querySelector('#connection')?.textContent === 'Live'");

    const filePath = join(root, 'parallel.dashboard.test.ts');
    const now = Date.now();
    session.emit({ type: 'run.started', status: 'running', runner: 'vitest', timestamp: now - 10 });
    session.emit({
      type: 'file.container-declared', status: 'ready', containerName: 'messages',
      containerKind: 'rabbit-mq', isolation: 'shared', filePath, timestamp: now - 5,
    });
    session.emit({
      type: 'container.starting', status: 'starting', containerName: 'messages',
      containerKind: 'rabbit-mq', isolation: 'shared', timestamp: now - 4,
    });
    session.emit({
      type: 'container.ready', status: 'ready', containerName: 'messages',
      containerKind: 'rabbit-mq', isolation: 'shared',
      mappedPorts: { '5672': 56_721 }, durationMs: 3, timestamp: now - 1,
    });
    session.emit({ type: 'file.started', status: 'running', filePath, timestamp: now });
    session.emit({
      type: 'file.container-declared', status: 'ready', containerName: 'database',
      containerKind: 'postgresql', isolation: 'dedicated', filePath, timestamp: now + 1,
    });
    session.emit({
      type: 'container.starting', status: 'starting', containerName: 'database',
      containerKind: 'postgresql', isolation: 'dedicated', filePath, timestamp: now + 5,
    });
    session.emit({
      type: 'container.ready', status: 'ready', containerName: 'database',
      containerKind: 'postgresql', isolation: 'dedicated', filePath,
      mappedPorts: { '5432': 54_321 }, durationMs: 125, timestamp: now + 130,
    });
    session.emit({
      type: 'container.log', containerName: 'database', containerKind: 'postgresql',
      isolation: 'dedicated', filePath, message: 'database system is ready',
      timestamp: now + 135,
    });
    session.emit({
      type: 'test.finished', status: 'passed', testId: 'passing',
      testName: 'passes through the live stream', filePath, durationMs: 80,
      timestamp: now + 150,
    });
    session.emit({
      type: 'test.finished', status: 'skipped', testId: 'skipped',
      testName: 'is intentionally skipped', filePath, timestamp: now + 160,
    });
    session.emit({
      type: 'test.finished', status: 'failed', testId: 'failure',
      testName: 'shows an intentional failure', filePath, durationMs: 20,
      error: 'expected failure detail', timestamp: now + 180,
    });
    for (let index = 1; index <= 4; index += 1) {
      session.emit({
        type: 'test.finished', status: 'skipped', testId: `skipped-${index}`,
        testName: `is additionally skipped ${index}`, filePath, timestamp: now + 180 + index,
      });
    }
    session.emit({ type: 'file.finished', status: 'failed', filePath, timestamp: now + 200 });
    session.emit({ type: 'run.finished', status: 'failed', runner: 'vitest', timestamp: now + 210 });

    await devtools.waitFor("document.querySelector('#containers')?.innerText.includes('parallel.dashboard.test.ts')");
    assert.equal(await devtools.evaluate<string>("document.querySelector('[data-tab][aria-selected=true]').textContent"), 'Containers');
    assert.match(await devtools.evaluate<string>("document.querySelector('#containers').innerText"), /selected by these test files/i);
    assert.doesNotMatch(await devtools.evaluate<string>("document.querySelector('#containers').innerText"), /available/i);
    assert.match(await devtools.evaluate<string>("document.querySelector('#containers').innerText"), /5432 → 54321/);
    const databaseCard = '.container-card[data-container-key^="database|"]';
    await devtools.evaluate(`document.querySelector('${databaseCard}').open=true`);
    assert.equal(await devtools.evaluate<boolean>(`document.querySelector('${databaseCard} .relation-file').open`), false);
    assert.match(await devtools.evaluate<string>(`document.querySelector('${databaseCard} .relation-file > summary').innerText`), /7 tests · 1 passed · 1 failed · 5 skipped/i);
    await devtools.evaluate(`document.querySelector('${databaseCard} .relation-file > summary').click()`);
    assert.equal(await devtools.evaluate<number>(`document.querySelectorAll('${databaseCard} .relation-test').length`), 5);
    assert.equal(await devtools.evaluate<string>(`document.querySelector('${databaseCard} .relation-pagination span').innerText`), 'Page 1 of 2');
    await devtools.evaluate(`document.querySelector('${databaseCard} [data-relation-page="2"]').click()`);
    assert.equal(await devtools.evaluate<number>(`document.querySelectorAll('${databaseCard} .relation-test').length`), 2);
    assert.equal(await devtools.evaluate<string>(`document.querySelector('${databaseCard} .relation-pagination span').innerText`), 'Page 2 of 2');
    assert.match(await devtools.evaluate<string>(`document.querySelector('${databaseCard} .container-logs').innerText`), /Show logs \(1\)/);
    await devtools.evaluate(`document.querySelector('${databaseCard} .container-logs').open=true`);
    assert.match(await devtools.evaluate<string>(`document.querySelector('${databaseCard} .container-log-output').innerText`), /database system is ready/);
    await devtools.evaluate("document.querySelector('[data-tab=tests]').click()");
    await devtools.waitFor("document.querySelector('#tests')?.innerText.includes('shows an intentional failure')");
    await devtools.evaluate("document.querySelector('.test-failure').open=true");
    assert.match(
      await devtools.evaluate<string>("document.querySelector('.test-failure pre').innerText"),
      /expected failure detail/,
    );
    await devtools.evaluate("document.querySelector('.test-failure').open=false");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 5);
    const fiveRowGridHeight = await devtools.evaluate<number>("document.querySelector('.test-table-wrap').getBoundingClientRect().height");
    assert.match(
      await devtools.evaluate<string>("document.querySelector('#test-average').innerText"),
      /AVERAGE TEST DURATION\s+50 ms\s+2 completed timed tests/,
    );
    const comparisons = await devtools.evaluate<string[]>(
      "[...document.querySelectorAll('.test-table .delta')].map((cell) => cell.innerText)",
    );
    assert.deepEqual(comparisons, ['▲ 30 ms', '▼ 30 ms', '—', '—', '—']);
    assert.equal(await devtools.evaluate<string>("document.querySelector('.delta.slower span').getAttribute('aria-label')"), '30 ms above average');
    assert.equal(await devtools.evaluate<string>("document.querySelector('.delta.faster span').getAttribute('aria-label')"), '30 ms below average');
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.segment').length"), 3);
    assert.ok(await devtools.evaluate<number>("document.querySelectorAll('.bar > i').length") >= 2);
    assert.match(await devtools.evaluate<string>("document.querySelector('#summary').innerText"), /5\s+Skipped/);

    await devtools.evaluate("document.querySelector('[data-summary-status=\"failed\"]').click()");
    assert.equal(await devtools.evaluate<string>("document.querySelector('[data-tab][aria-selected=true]').dataset.tab"), 'tests');
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 1);
    assert.match(await devtools.evaluate<string>("document.querySelector('#tests').innerText"), /intentional failure/);
    assert.equal(await devtools.evaluate<string>("document.querySelector('[data-summary-status=\"failed\"]').getAttribute('aria-pressed')"), 'true');
    await devtools.evaluate("document.querySelector('[data-summary-status=\"skipped\"]').click()");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 5);
    await devtools.evaluate("document.querySelector('[data-summary-status=\"passed\"]').click()");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 1);
    await devtools.evaluate("document.querySelector('[data-summary-status=\"all\"]').click()");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 5);
    await devtools.evaluate("document.querySelector('[data-summary-action=\"containers\"]').click()");
    assert.equal(await devtools.evaluate<string>("document.querySelector('[data-tab][aria-selected=true]').dataset.tab"), 'containers');
    await devtools.evaluate("document.querySelector('[data-summary-action=\"lifecycle\"]').click()");
    assert.equal(await devtools.evaluate<string>("document.querySelector('[data-tab][aria-selected=true]').dataset.tab"), 'lifecycle');
    assert.match(
      await devtools.evaluate<string>("document.querySelector('#lifecycle-view').innerText"),
      /Test file execution · parallel\.dashboard\.test\.ts/,
    );
    await devtools.evaluate("document.querySelector('[data-summary-status=\"all\"]').click()");
    assert.equal(await devtools.evaluate<string>("document.querySelector('[data-tab][aria-selected=true]').dataset.tab"), 'tests');

    await devtools.evaluate(`(() => {
      const filter = document.querySelector('#test-name-filter');
      filter.value = 'intentional failure';
      filter.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 1);
    assert.match(await devtools.evaluate<string>("document.querySelector('#tests').innerText"), /intentional failure/);
    await devtools.evaluate("document.querySelector('#test-name-filter').value='';document.querySelector('#test-name-filter').dispatchEvent(new Event('input'))");
    await devtools.evaluate("document.querySelector('[data-status-action=none]').click();document.querySelector('#status-filter-options input[value=failed]').click()");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 1);
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-table tbody tr').length"), 5);
    assert.equal(await devtools.evaluate<number>("document.querySelector('.test-table-wrap').getBoundingClientRect().height"), fiveRowGridHeight);
    assert.equal(await devtools.evaluate<string>("getComputedStyle(document.querySelector('#status-filter-options')).position"), 'fixed');
    assert.equal(await devtools.evaluate<string>("getComputedStyle(document.querySelector('.test-table-wrap')).overflowY"), 'hidden');
    assert.equal(await devtools.evaluate<string>("document.querySelector('#status-filter-summary').innerText"), '1 of 3');
    await devtools.evaluate("document.querySelector('[data-status-action=all]').click()");
    await devtools.evaluate("document.querySelector('#file-name-filter').value='parallel';document.querySelector('#file-name-filter').dispatchEvent(new Event('input'))");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 5);
    assert.equal(await devtools.evaluate<string>("document.querySelector('.page-summary').innerText"), '1–5 of 7 tests');
    await devtools.evaluate("document.querySelector('[data-page=\"2\"]').click()");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 2);
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-table tbody tr').length"), 5);
    assert.equal(await devtools.evaluate<string>("document.querySelector('.page-summary').innerText"), '6–7 of 7 tests');
    await devtools.evaluate("document.querySelector('#test-page-size').value='10';document.querySelector('#test-page-size').dispatchEvent(new Event('change'))");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 7);
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-table tbody tr').length"), 10);
    await devtools.evaluate("document.querySelector('#clear-test-filters').click()");
    await devtools.evaluate("document.querySelector('[data-sort=status]').click()");
    assert.match(await devtools.evaluate<string>("document.querySelector('.test-table thead').innerText"), /STATUS/);

    session.emit({ type: 'run.started', status: 'running', runner: 'vitest', timestamp: now + 300 });
    session.emit({ type: 'file.started', status: 'running', filePath, timestamp: now + 310 });
    session.emit({
      type: 'file.container-declared', status: 'ready', containerName: 'cache',
      containerKind: 'custom', isolation: 'dedicated', filePath, timestamp: now + 311,
    });
    session.emit({
      type: 'container.starting', status: 'starting', containerName: 'cache',
      containerKind: 'custom', isolation: 'dedicated', filePath, timestamp: now + 312,
    });
    session.emit({
      type: 'container.failed', status: 'failed', containerName: 'cache',
      containerKind: 'custom', isolation: 'dedicated', filePath,
      message: 'custom container startup failed', error: 'cache refused startup',
      timestamp: now + 313,
    });
    session.emit({
      type: 'test.started', status: 'running', testId: 'long-running',
      testName: 'remains visibly in progress', filePath, timestamp: now + 320,
    });
    await devtools.waitFor("document.querySelector('#tests')?.innerText.includes('remains visibly in progress')");
    assert.equal(await devtools.evaluate<string>("document.querySelector('#run-selector').value"), 'latest');
    assert.match(await devtools.evaluate<string>("document.querySelector('#tests').innerText"), /RUNNING/);
    await devtools.evaluate("document.querySelector('[data-tab=containers]').click()");
    await devtools.waitFor("document.querySelector('#containers')?.textContent.includes('cache refused startup')");
    await devtools.evaluate("document.querySelector('.container-card[data-container-key^=\"cache|\"]').open=true");
    const latestContainers = await devtools.evaluate<string>("document.querySelector('#containers').innerText");
    assert.match(latestContainers, /messages/);
    assert.match(latestContainers, /cache/);
    assert.match(latestContainers, /FAILED/);
    assert.match(latestContainers, /custom container startup failed[\s\S]*cache refused startup/);
    assert.doesNotMatch(latestContainers, /database/);
    await devtools.evaluate("document.querySelector('[data-tab=tests]').click()");
    await devtools.evaluate("document.querySelector('#run-selector').value='all';document.querySelector('#run-selector').dispatchEvent(new Event('change'))");
    assert.equal(await devtools.evaluate<number>("document.querySelectorAll('.test-case').length"), 8);
    await devtools.evaluate("document.querySelector('#run-selector').value='latest';document.querySelector('#run-selector').dispatchEvent(new Event('change'))");
    session.emit({
      type: 'test.finished', status: 'passed', testId: 'long-running',
      testName: 'remains visibly in progress', filePath, durationMs: 1_000,
      timestamp: now + 1_320,
    });
    session.emit({ type: 'file.finished', status: 'passed', filePath, timestamp: now + 1_330 });
    session.emit({ type: 'run.finished', status: 'passed', runner: 'vitest', timestamp: now + 1_340 });

    const reportPath = await session.finalize();
    session = undefined;
    if (reportPath === undefined) throw new Error('Dashboard report was not generated');
    await devtools.navigate(pathToFileURL(reportPath).href);
    await devtools.waitFor("document.readyState === 'complete'");
    assert.equal(await devtools.evaluate<string>("document.querySelector('#connection').textContent"), 'Saved report');
    await devtools.evaluate("document.querySelector('[data-tab=tests]').click()");
    assert.match(await devtools.evaluate<string>("document.querySelector('#tests').innerText"), /remains visibly in progress/);

    const emptySession = new DashboardSession(root, 'jest', {
      open: false,
      outputDirectory: 'empty-reports',
    });
    await emptySession.start();
    const emptyReport = await emptySession.finalize();
    if (emptyReport === undefined) throw new Error('Empty dashboard report was not generated');
    await devtools.navigate(pathToFileURL(emptyReport).href);
    await devtools.waitFor("document.readyState === 'complete'");
    assert.match(await devtools.evaluate<string>('document.body.innerText'), /No container events were recorded/);
    await devtools.evaluate("document.querySelector('[data-tab=tests]').click()");
    assert.match(await devtools.evaluate<string>("document.querySelector('#tests').innerText"), /Tests have not started yet/);
  } finally {
    await session?.finalize();
    browser?.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  }
});

const launchChrome = async (
  executable: string,
  root: string,
): Promise<{ process: ChildProcess; devtools: Devtools }> => {
  const profile = join(root, 'chrome-profile');
  const process_ = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  const [port] = (await waitForFile(portFile)).trim().split('\n');
  if (port === undefined) throw new Error('Chrome did not expose a debugging port');
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await response.json() as readonly Readonly<{
    type: string;
    webSocketDebuggerUrl?: string;
  }>[];
  const endpoint = targets.find(({ type }) => type === 'page')?.webSocketDebuggerUrl;
  if (endpoint === undefined) throw new Error('Chrome did not expose a page target');
  return { process: process_, devtools: await Devtools.connect(endpoint) };
};

const waitForFile = async (path: string): Promise<string> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
};

class Devtools {
  private nextId = 0;
  private readonly pending = new Map<number, {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (message) => {
      const value = JSON.parse(String(message.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (value.id === undefined) return;
      const pending = this.pending.get(value.id);
      if (pending === undefined) return;
      this.pending.delete(value.id);
      if (value.error === undefined) pending.resolve(value.result);
      else pending.reject(new Error(value.error.message ?? 'Chrome DevTools command failed'));
    });
  }

  static async connect(endpoint: string): Promise<Devtools> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener('open', () => resolveOpen(), { once: true });
      socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), {
        once: true,
      });
    });
    const devtools = new Devtools(socket);
    await devtools.call('Page.enable');
    return devtools;
  }

  async navigate(url: string): Promise<void> {
    await this.call('Page.navigate', { url });
    await this.waitFor("document.readyState === 'complete'");
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }) as { result?: { value?: T }; exceptionDetails?: unknown };
    if (response.exceptionDetails !== undefined) {
      throw new Error(`Browser expression failed: ${expression}`);
    }
    return response.result?.value as T;
  }

  async waitFor(expression: string): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await this.evaluate<boolean>(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for browser expression: ${expression}`);
  }

  private call(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolveCall, reject) => {
      this.pending.set(id, { resolve: resolveCall, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}
