import { appendFile, access, writeFile } from 'node:fs/promises';
import type { ContainerResources } from '@integration-testing/testcontainers';
import { Container } from '@integration-testing/testcontainers';
import type { FileIsolationBackend } from './fixture-backend.js';

export interface FileIsolationReport {
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

export const exerciseFileIsolation = async (
  file: string,
  resources: ContainerResources,
  application: FileIsolationBackend,
): Promise<FileIsolationReport> => {
  const suite = requiredEnvironment('FILE_ISOLATION_SUITE');
  const reportPath = requiredEnvironment('FILE_ISOLATION_REPORT');
  const startedAt = Date.now();
  const readyPath = `${reportPath}.${suite}.${file}.ready`;
  const peer = file === 'first' ? 'second' : 'first';
  const peerPath = `${reportPath}.${suite}.${peer}.ready`;
  await writeFile(readyPath, String(startedAt));
  await waitForFile(peerPath);

  const value = `saved-by-${suite}-${file}`;
  const [primaryValue, auditValue] = await application.insertAndReadSameIdentifier(value);
  const message = `message-from-${suite}-${file}`;
  const receivedMessage = await application.publishAndReceive(message);
  const rabbitPort = resources.getNamed('messages', Container.RabbitMq).port;
  const primaryPort = resources.getNamed('primaryDatabase', Container.PostgreSql).port;
  const auditPort = resources.getNamed('auditDatabase', Container.PostgreSql).port;
  const report: FileIsolationReport = {
    suite,
    file,
    startedAt,
    completedAt: Date.now(),
    rabbitPort,
    primaryPort,
    auditPort,
    primaryValue,
    auditValue,
    receivedMessage,
  };
  await appendFile(reportPath, `${JSON.stringify(report)}\n`);
  return report;
};

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Parallel peer did not become ready: ${path}`);
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
};
