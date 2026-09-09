import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { expect, test } from 'vitest';
import { applicationContext } from './application.setup.js';

@RequiredContainer({
  database: { kind: Container.SqlServer, isolation: 'shared' },
})
@ApplicationIntegrationTest
export class AnnotatedVitestIntegrationTest {}

test(
  'given an annotated Vitest file, when its hooks run, then the application receives shared resources',
  () => {
    expect(applicationContext.current().port).toBe(24_433);
  },
);
