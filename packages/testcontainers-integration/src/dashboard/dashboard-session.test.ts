import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  DASHBOARD_SESSIONS_ENV,
  dashboardDescriptorFor,
} from './dashboard-context.js';
import { DashboardSession } from './dashboard-session.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  delete process.env[DASHBOARD_SESSIONS_ENV];
});

describe('DashboardSession', () => {
  test('serves token-protected live events and writes a sanitized self-contained report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'integration-dashboard-test-'));
    roots.push(root);
    const session = new DashboardSession(root, 'vitest', {
      open: false,
      outputDirectory: 'reports',
    });

    await session.start();
    const descriptor = dashboardDescriptorFor(join(root, 'test', 'example.test.ts'));
    if (descriptor === undefined) throw new Error('Dashboard descriptor was not registered');
    const registryPath = process.env[DASHBOARD_SESSIONS_ENV];
    if (registryPath === undefined) throw new Error('Dashboard token registry was not created');
    expect((await stat(registryPath)).mode & 0o777).toBe(0o600);

    const page = await fetch(descriptor.dashboardUrl);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Vitest integration dashboard');

    const eventsUrl = descriptor.dashboardUrl.replace('/session/', '/events/');
    for (let connection = 0; connection < 2; connection += 1) {
      const abort = new AbortController();
      const stream = await fetch(eventsUrl, { signal: abort.signal });
      expect(stream.status).toBe(200);
      const chunk = await stream.body?.getReader().read();
      const value: unknown = chunk?.value;
      expect(new TextDecoder().decode(value instanceof Uint8Array ? value : undefined)).toContain('connected');
      abort.abort();
    }

    const unauthorized = await fetch(`${descriptor.endpoint}/api/events`, {
      method: 'POST',
      body: '[]',
    });
    expect(unauthorized.status).toBe(401);

    const accepted = await fetch(`${descriptor.endpoint}/api/events`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${descriptor.writeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([{
        type: 'test.finished',
        status: 'passed',
        testName: 'safe event',
        filePath: '/workspace/example.test.ts',
        connectionUri: 'postgresql://secret:password@localhost/database',
      }]),
    });
    expect(accepted.status).toBe(204);

    const reportPath = await session.finalize();
    if (reportPath === undefined) throw new Error('Dashboard report was not generated');
    const report = await readFile(reportPath, 'utf8');
    expect(report).toContain('safe event');
    expect(report).not.toContain('secret:password');
    expect(report).not.toContain(descriptor.writeToken);
    expect(process.env[DASHBOARD_SESSIONS_ENV]).toBeUndefined();
  });

  test('writes an independent report snapshot for each watch-mode run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'integration-dashboard-watch-test-'));
    roots.push(root);
    const session = new DashboardSession(root, 'vitest', {
      open: false,
      outputDirectory: 'reports',
    });
    await session.start();
    session.emit({ type: 'run.started', runner: 'vitest', status: 'running' });
    session.emit({
      type: 'file.container-declared',
      status: 'ready',
      containerName: 'messages',
      containerKind: 'rabbit-mq',
      isolation: 'shared',
    });
    session.emit({
      type: 'container.starting',
      status: 'starting',
      containerName: 'messages',
      containerKind: 'rabbit-mq',
      isolation: 'shared',
    });
    session.emit({
      type: 'container.ready',
      status: 'ready',
      containerName: 'messages',
      containerKind: 'rabbit-mq',
      isolation: 'shared',
      mappedPorts: { '5672': 56_721 },
    });
    session.emit({ type: 'test.finished', status: 'passed', testName: 'first watch run' });
    session.emit({ type: 'run.finished', runner: 'vitest', status: 'passed' });
    session.emit({ type: 'run.started', runner: 'vitest', status: 'running' });
    session.emit({ type: 'test.finished', status: 'passed', testName: 'second watch run' });
    session.emit({ type: 'run.finished', runner: 'vitest', status: 'passed' });

    const indexPath = await session.finalize();
    if (indexPath === undefined) throw new Error('Dashboard report was not generated');
    const first = await readFile(join(dirname(indexPath), 'run-1.html'), 'utf8');
    const second = await readFile(join(dirname(indexPath), 'run-2.html'), 'utf8');
    expect(first).toContain('first watch run');
    expect(first).not.toContain('second watch run');
    expect(second).toContain('second watch run');
    expect(second).not.toContain('first watch run');
    expect(second).toContain('messages');
    expect(second).toContain('container.ready');
    expect(second).toContain('56721');
  });
});
