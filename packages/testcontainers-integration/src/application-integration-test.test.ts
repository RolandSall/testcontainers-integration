import { afterEach, expect, test } from 'vitest';
import {
  ApplicationIntegrationTest,
  consumeApplicationIntegrationTestClass,
  consumeApplicationIntegrationTestClasses,
  isApplicationIntegrationTest,
} from './application-integration-test.js';

afterEach(() => {
  consumeApplicationIntegrationTestClasses();
});

test(
  'given an application marker, when its metadata is consumed, then the decorated class is returned once',
  () => {
    @ApplicationIntegrationTest
    class CandidateApiIntegrationTest {}

    expect(isApplicationIntegrationTest(CandidateApiIntegrationTest)).toBe(true);
    expect(consumeApplicationIntegrationTestClass()).toBe(
      CandidateApiIntegrationTest,
    );
    expect(consumeApplicationIntegrationTestClass()).toBeUndefined();
  },
);

test(
  'given multiple application markers, when file metadata is consumed, then ambiguous application ownership is rejected',
  () => {
    @ApplicationIntegrationTest
    class CandidateApiIntegrationTest {}

    @ApplicationIntegrationTest
    class VacancyApiIntegrationTest {}

    expect(() => consumeApplicationIntegrationTestClass()).toThrow(
      'Expected one @ApplicationIntegrationTest class in the test file, found 2',
    );
    expect(isApplicationIntegrationTest(CandidateApiIntegrationTest)).toBe(true);
    expect(isApplicationIntegrationTest(VacancyApiIntegrationTest)).toBe(true);
  },
);
