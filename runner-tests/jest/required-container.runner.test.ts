import { expect, test } from '@jest/globals';
import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { applicationContext } from './application.setup';

@RequiredContainer({
  database: { kind: Container.SqlServer, isolation: 'shared' },
})
@ApplicationIntegrationTest
export class AnnotatedJestIntegrationTest {}

test(
  'given an annotated Jest file, when its hooks run, then the application receives shared resources',
  () => {
    expect(applicationContext.current().port).toBe(14_433);
  },
);
