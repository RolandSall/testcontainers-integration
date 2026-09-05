import type { Readable } from 'node:stream';
import type { IntegrationTestLogger } from './integration-test-logger.js';

/**
 * Creates a Testcontainers log consumer that converts stream chunks into scoped lines.
 * Partial chunks are buffered until a newline or stream completion is observed.
 */
export const createContainerLogConsumer = (
  kind: string,
  logger: IntegrationTestLogger,
): ((stream: Readable) => void) =>
  (stream) => {
    let pending = '';

    const emitCompleteLines = (): void => {
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) {
          logger.info(`container:${kind}`, line);
        }
      }
    };

    stream.on('data', (chunk: unknown) => {
      if (typeof chunk === 'string') {
        pending += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        pending += chunk.toString('utf8');
      } else {
        pending += String(chunk);
      }
      emitCompleteLines();
    });
    stream.on('end', () => {
      if (pending.length > 0) {
        logger.info(`container:${kind}`, pending);
        pending = '';
      }
    });
    stream.on('error', (error: unknown) => {
      logger.error(`container:${kind}`, 'log stream failed', error);
    });
  };
