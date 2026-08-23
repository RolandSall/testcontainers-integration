import { afterEach, describe, expect, test, vi } from 'vitest';
import { ConsoleIntegrationTestLogger } from './console-integration-test-logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsoleIntegrationTestLogger', () => {
  test(
    'given a fixed clock, when an integration event is logged, then its line starts with an ISO timestamp and scope',
    () => {
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new ConsoleIntegrationTestLogger(
        () => new Date('2026-08-23T00:38:13.123Z'),
      );

      logger.info('runtime', 'shared container network is ready');

      expect(write).toHaveBeenCalledWith(
        '[2026-08-23T00:38:13.123Z] [integration:runtime] shared container network is ready\n',
      );
    },
  );
});
