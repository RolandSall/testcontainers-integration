import { expect, expectTypeOf, test } from 'vitest';
import { ApplicationIntegrationTest } from '../application-integration-test.js';
import { Container } from '../container-kind.js';
import { RequiredContainer } from '../required-container.js';
import {
  type FakeApiApplication,
  applicationLifecycleEvents,
  testApiApplicationContext,
} from './application-integration-test.setup.test-helper.js';

@RequiredContainer({
  database: { kind: Container.SqlServer, isolation: 'shared' },
})
@ApplicationIntegrationTest
export class CandidateApiIntegrationTest {}

test(
  'given an annotated Vitest file, when setup completes, then its typed application uses provided container resources',
  () => {
    const application = testApiApplicationContext.current();

    expectTypeOf(application).toEqualTypeOf<FakeApiApplication>();
    expect(application).toEqual({ databasePort: 14_333 });
    expect(applicationLifecycleEvents).toEqual(['application started']);
  },
);
