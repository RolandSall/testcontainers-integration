import { expect, test } from 'vitest';
import {
  applicationLifecycleEvents,
  testApiApplicationContext,
} from './application-integration-test.setup.test-helper.js';

test(
  'given an unannotated Vitest file, when shared setup runs, then the application remains inactive',
  () => {
    expect(applicationLifecycleEvents).toEqual([]);
    expect(() => testApiApplicationContext.current()).toThrow(
      'Application integration-test context is not active',
    );
  },
);
