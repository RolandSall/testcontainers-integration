import { injectedContainerResources } from '@integration-testing/testcontainers/vitest';
import { expect, test } from 'vitest';
import { applicationContext } from './vitest-application.setup.js';
import { exerciseFileIsolation } from './report.js';

export const runVitestFile = (file: 'first' | 'second'): void => {
  test(`${file} uses shared messaging holder and file-dedicated databases`, async () => {
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
