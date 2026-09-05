import { expect, test } from '@jest/globals';
import { applicationContext } from './application.setup';

test(
  'given an unannotated Jest file, when its hooks run, then no application is started',
  () => {
    expect(() => applicationContext.current()).toThrow(
      'Application integration-test context is not active',
    );
  },
);
