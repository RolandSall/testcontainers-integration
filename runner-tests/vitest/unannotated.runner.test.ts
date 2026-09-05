import { expect, test } from 'vitest';
import { applicationContext } from './application.setup.js';

test(
  'given an unannotated Vitest file, when its hooks run, then no application is started',
  () => {
    expect(() => applicationContext.current()).toThrow(
      'Application integration-test context is not active',
    );
  },
);
