import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createContainerLogConsumer } from './container-log-consumer.js';
import type { IntegrationTestLogger } from './integration-test-logger.js';

class RecordingLogger implements IntegrationTestLogger {
  readonly entries: string[] = [];

  info(scope: string, message: string): void {
    this.entries.push(`${scope}: ${message}`);
  }

  error(scope: string, message: string, error?: unknown): void {
    this.entries.push(`${scope}: ${message}: ${String(error)}`);
  }
}

describe('createContainerLogConsumer', () => {
  test(
    'given chunked container output, when the stream ends, then complete prefixed lines are logged',
    async () => {
      const logger = new RecordingLogger();
      const stream = new PassThrough();
      createContainerLogConsumer('sql-server', logger)(stream);

      const ended = new Promise<void>((resolve) => {
        stream.once('end', resolve);
      });
      stream.write('pulling image\nSQL Server');
      stream.end(' is ready');
      await ended;

      expect(logger.entries).toEqual([
        'container:sql-server: pulling image',
        'container:sql-server: SQL Server is ready',
      ]);
    },
  );
});
