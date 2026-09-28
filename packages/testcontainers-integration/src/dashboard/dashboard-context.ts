import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { DashboardEventInput, IntegrationTestEventSink } from './dashboard-event.js';
import { DashboardEventClient } from './dashboard-event-client.js';

export const DASHBOARD_SESSIONS_ENV = 'INTEGRATION_TESTING_DASHBOARD_SESSIONS';

export interface DashboardSessionDescriptor {
  readonly root: string;
  readonly endpoint: string;
  readonly writeToken: string;
  readonly dashboardUrl: string;
  readonly runId: string;
}

type DashboardSessionMap = Readonly<Record<string, DashboardSessionDescriptor>>;

/** Registers a session descriptor so reporters and isolated workers can find it. */
export const registerDashboardSession = (
  descriptor: DashboardSessionDescriptor,
): void => {
  const sessions = readDashboardSessions();
  const registryPath = dashboardRegistryPath();
  writeFileSync(registryPath, JSON.stringify({
    ...sessions,
    [resolve(descriptor.root)]: descriptor,
  }), { encoding: 'utf8', mode: 0o600 });
  chmodSync(registryPath, 0o600);
};

/** Removes one dashboard descriptor without disturbing concurrent projects. */
export const unregisterDashboardSession = (root: string): void => {
  const sessions = { ...readDashboardSessions() };
  delete sessions[resolve(root)];
  const registryPath = process.env[DASHBOARD_SESSIONS_ENV];
  if (registryPath === undefined) return;
  if (Object.keys(sessions).length === 0) {
    rmSync(dirname(registryPath), { recursive: true, force: true });
    delete process.env[DASHBOARD_SESSIONS_ENV];
  } else {
    writeFileSync(registryPath, JSON.stringify(sessions), { encoding: 'utf8', mode: 0o600 });
  }
};

export const dashboardDescriptorFor = (
  filePath?: string,
): DashboardSessionDescriptor | undefined => {
  const sessions = Object.values(readDashboardSessions());
  if (filePath === undefined) return sessions.length === 1 ? sessions[0] : undefined;
  const absolute = resolve(filePath);
  return sessions
    .filter(({ root }) => isWithin(resolve(root), absolute))
    .sort((left, right) => right.root.length - left.root.length)[0];
};

export const dashboardEventSinkFor = (
  filePath?: string,
): IntegrationTestEventSink | undefined => {
  const descriptor = dashboardDescriptorFor(filePath);
  if (descriptor === undefined) return undefined;
  const client = DashboardEventClient.for(descriptor);
  return {
    emit: (event: DashboardEventInput) => client.emit({
      ...event,
      ...(event.filePath === undefined && filePath !== undefined ? { filePath } : {}),
    }),
  };
};

export const emitDashboardEventFor = (
  filePath: string | undefined,
  event: DashboardEventInput,
): void => {
  dashboardEventSinkFor(filePath)?.emit(event);
};

export const emitDashboardEventForEverySession = (
  event: DashboardEventInput,
): void => {
  for (const descriptor of Object.values(readDashboardSessions())) {
    DashboardEventClient.for(descriptor).emit(event);
  }
};

export const flushDashboardEvents = async (): Promise<void> => {
  await DashboardEventClient.flushAll();
};

const readDashboardSessions = (): DashboardSessionMap => {
  const registryPath = process.env[DASHBOARD_SESSIONS_ENV];
  if (registryPath === undefined) return {};
  try {
    const serialized = readFileSync(registryPath, 'utf8');
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return value as DashboardSessionMap;
  } catch {
    return {};
  }
};

const dashboardRegistryPath = (): string => {
  const existing = process.env[DASHBOARD_SESSIONS_ENV];
  if (existing !== undefined) return existing;
  const directory = mkdtempSync(join(tmpdir(), 'integration-testing-dashboard-'));
  const registryPath = join(directory, 'sessions.json');
  process.env[DASHBOARD_SESSIONS_ENV] = registryPath;
  return registryPath;
};

const isWithin = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};
