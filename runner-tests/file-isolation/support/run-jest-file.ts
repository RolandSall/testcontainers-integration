import { expect, test } from '@jest/globals';
import { injectedContainerResources } from '@integration-testing/testcontainers/jest';
import { applicationContext } from './jest-application.setup';
import { exerciseFileIsolation } from './report';

export const runJestFile = (file: 'first' | 'second'): void => {
  test(`${file} uses shared RabbitMQ and file-dedicated databases`, async () => {
    const report = await exerciseFileIsolation(
      file,
      injectedContainerResources(),
      applicationContext.current(),
    );
    expect(report.primaryValue).toBe(`saved-by-${report.suite}-${file}`);
    expect(report.auditValue).toBe(`saved-by-${report.suite}-${file}`);
    expect(report.receivedMessage).toBe(`message-from-${report.suite}-${file}`);
    expect(report.primaryPort).not.toBe(report.auditPort);
  });
};
