import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { SerializedIntegrationDashboardOptions } from './dashboard-config.js';
import {
  dashboardErrorMessage,
  normalizeDashboardEvent,
  type DashboardEvent,
  type DashboardEventInput,
  type DashboardRunner,
  type IntegrationTestEventSink,
} from './dashboard-event.js';
import {
  registerDashboardSession,
  type DashboardSessionDescriptor,
  unregisterDashboardSession,
} from './dashboard-context.js';
import { renderDashboardDocument } from './dashboard-html.js';

const MAX_REQUEST_BYTES = 1_048_576;

/** Owns one local dashboard server and its self-contained reports. */
export class DashboardSession implements IntegrationTestEventSink {
  private readonly events: DashboardEvent[] = [];
  private readonly readers = new Set<ServerResponse>();
  private readonly readToken = randomBytes(18).toString('base64url');
  private readonly writeToken = randomBytes(24).toString('base64url');
  private readonly runId = createRunId();
  private readonly server = createServer((request, response) => {
    void this.handle(request, response);
  });
  private descriptor: DashboardSessionDescriptor | undefined;
  private reportChain: Promise<void> = Promise.resolve();
  private runCount = 0;
  private currentRunStartIndex = 0;
  private runActive = false;
  private finalized = false;

  constructor(
    private readonly root: string,
    private readonly runner: DashboardRunner,
    private readonly options: SerializedIntegrationDashboardOptions,
  ) {}

  async start(): Promise<void> {
    await new Promise<void>((resolveListen, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolveListen();
      });
    });
    const address = this.server.address() as AddressInfo;
    const endpoint = `http://127.0.0.1:${address.port}`;
    const dashboardUrl = `${endpoint}/session/${this.readToken}`;
    this.descriptor = {
      root: resolve(this.root),
      endpoint,
      writeToken: this.writeToken,
      dashboardUrl,
      runId: this.runId,
    };
    try {
      registerDashboardSession(this.descriptor);
    } catch (error) {
      await new Promise<void>((resolveClose) => this.server.close(() => resolveClose()));
      this.descriptor = undefined;
      throw error;
    }
    this.emit({
      type: 'dashboard.started',
      runner: this.runner,
      status: 'ready',
      scope: 'dashboard',
      message: `live dashboard available at ${dashboardUrl}`,
    });
    // Runner reporters can announce their first run before global setup has
    // registered this session. Start the initial run here so the dashboard
    // never presents a live test execution as an ambiguous "current session".
    this.emit({
      type: 'run.started',
      runner: this.runner,
      status: 'running',
      scope: 'runner',
      message: `${this.runner === 'jest' ? 'Jest' : 'Vitest'} run started`,
    });
    process.stdout.write(`[integration:dashboard] ${dashboardUrl}\n`);
    if (this.options.open && process.env.CI === undefined) openBrowser(dashboardUrl);
  }

  emit(input: DashboardEventInput): void {
    const event = normalizeDashboardEvent(input);
    // Global setup owns the initial marker. Some runner versions invoke the
    // reporter after setup and some before it, so collapse duplicate boundary
    // events instead of showing one physical execution as two dashboard runs.
    if (event.type === 'run.started' && this.runActive) return;
    if (event.type === 'run.finished' && !this.runActive) return;
    if (event.type === 'run.started') this.currentRunStartIndex = this.events.length;
    this.events.push(event);
    if (event.type === 'run.started') {
      this.runCount += 1;
      this.runActive = true;
    }
    if (event.type === 'run.finished') this.runActive = false;
    for (const reader of this.readers) {
      try {
        reader.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        this.readers.delete(reader);
      }
    }
    if (event.type === 'run.finished') {
      const runNumber = Math.max(1, this.runCount);
      const runEvents = [
        ...this.persistentSharedEventsBefore(this.currentRunStartIndex),
        ...this.events.slice(this.currentRunStartIndex),
      ];
      this.reportChain = this.reportChain.then(async () => {
        await this.writeReport(`run-${runNumber}.html`, runEvents);
      });
    }
  }

  private persistentSharedEventsBefore(index: number): readonly DashboardEvent[] {
    return this.events
      .slice(0, index)
      .filter(({ isolation }) => isolation === 'shared');
  }

  async finalize(): Promise<string | undefined> {
    if (this.finalized) return this.reportPath('index.html');
    this.finalized = true;
    this.emit({
      type: 'dashboard.stopped',
      runner: this.runner,
      status: 'stopped',
      scope: 'dashboard',
      message: 'dashboard session completed',
    });
    try {
      await this.reportChain;
    } catch (error) {
      process.stderr.write(
        `[integration:dashboard] run report generation failed: ${dashboardErrorMessage(error)}\n`,
      );
    }
    let report: string | undefined;
    try {
      report = await this.writeReport('index.html');
      process.stdout.write(`[integration:dashboard] report: ${report}\n`);
    } catch (error) {
      process.stderr.write(
        `[integration:dashboard] report generation failed: ${dashboardErrorMessage(error)}\n`,
      );
    }
    for (const reader of this.readers) {
      try {
        reader.end();
      } catch {
        // A disconnected browser must never affect test teardown.
      }
    }
    this.readers.clear();
    await new Promise<void>((resolveClose) => this.server.close(() => resolveClose()));
    try {
      unregisterDashboardSession(this.root);
    } catch (error) {
      process.stderr.write(
        `[integration:dashboard] token cleanup failed: ${dashboardErrorMessage(error)}\n`,
      );
    }
    return report;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === `/session/${this.readToken}`) {
      response.writeHead(200, secureHeaders('text/html; charset=utf-8'));
      response.end(renderDashboardDocument({
        title: `${this.runner === 'jest' ? 'Jest' : 'Vitest'} integration dashboard`,
        events: this.events,
        eventsUrl: `/events/${this.readToken}`,
      }));
      return;
    }
    if (request.method === 'GET' && url.pathname === `/events/${this.readToken}`) {
      response.writeHead(200, {
        ...secureHeaders('text/event-stream; charset=utf-8'),
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });
      response.write(': connected\n\n');
      this.readers.add(response);
      request.once('close', () => this.readers.delete(response));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/events') {
      if (request.headers.authorization !== `Bearer ${this.writeToken}`) {
        response.writeHead(401, secureHeaders('text/plain; charset=utf-8'));
        response.end('Unauthorized');
        return;
      }
      try {
        const body = await readBody(request);
        const value: unknown = JSON.parse(body);
        if (!Array.isArray(value)) throw new Error('Expected an event array');
        for (const event of value) {
          const safe = parseEvent(event);
          if (safe !== undefined) this.emit(safe);
        }
        response.writeHead(204, secureHeaders());
        response.end();
      } catch (error) {
        response.writeHead(400, secureHeaders('text/plain; charset=utf-8'));
        response.end(dashboardErrorMessage(error));
      }
      return;
    }
    response.writeHead(404, secureHeaders('text/plain; charset=utf-8'));
    response.end('Not found');
  }

  private async writeReport(
    fileName: string,
    events: readonly DashboardEvent[] = this.events,
  ): Promise<string> {
    const path = this.reportPath(fileName);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, renderDashboardDocument({
      title: `${this.runner === 'jest' ? 'Jest' : 'Vitest'} integration report`,
      events,
    }), { encoding: 'utf8', mode: 0o600 });
    return path;
  }

  private reportPath(fileName: string): string {
    return resolve(this.root, this.options.outputDirectory, this.runId, fileName);
  }
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const rawChunk of request) {
    const chunk: unknown = rawChunk;
    const buffer = typeof chunk === 'string'
      ? Buffer.from(chunk)
      : chunk instanceof Uint8Array
        ? Buffer.from(chunk)
        : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new Error('Dashboard event request is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseEvent = (value: unknown): DashboardEventInput | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || candidate.type.length === 0) return undefined;
  const event: Record<string, unknown> = { type: candidate.type };
  const strings = [
    'runner', 'status', 'scope', 'message', 'filePath', 'testId', 'testName',
    'containerName', 'containerKind', 'isolation', 'image', 'containerId', 'error',
  ];
  for (const key of strings) {
    if (typeof candidate[key] === 'string') event[key] = candidate[key];
  }
  for (const key of ['timestamp', 'durationMs']) {
    if (typeof candidate[key] === 'number' && Number.isFinite(candidate[key])) event[key] = candidate[key];
  }
  if (isNumberRecord(candidate.mappedPorts)) event.mappedPorts = candidate.mappedPorts;
  return event as DashboardEventInput;
};

const isNumberRecord = (value: unknown): value is Readonly<Record<string, number>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.values(value).every((candidate) => typeof candidate === 'number' && Number.isFinite(candidate));

const secureHeaders = (contentType?: string): Record<string, string> => ({
  ...(contentType === undefined ? {} : { 'content-type': contentType }),
  'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
});

const createRunId = (): string =>
  `${new Date().toISOString().replaceAll(/[:.]/gu, '-')}-${randomBytes(4).toString('hex')}`;

const openBrowser = (url: string): void => {
  const command = process.platform === 'darwin'
    ? { executable: 'open', arguments: [url] }
    : process.platform === 'win32'
      ? { executable: 'cmd', arguments: ['/c', 'start', '', url] }
      : { executable: 'xdg-open', arguments: [url] };
  const child = spawn(command.executable, command.arguments, {
    detached: true,
    stdio: 'ignore',
  });
  child.once('error', (error) => {
    process.stderr.write(`[integration:dashboard] could not open browser: ${dashboardErrorMessage(error)}\n`);
  });
  child.unref();
};
