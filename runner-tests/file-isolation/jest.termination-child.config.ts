import { fromContainer, postgreSql } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/jest';

export default defineContainerProject({
  include: ['**/runner-tests/file-isolation/termination/jest-child.sentinel.test.ts'],
  containers: {
    sharedDatabase: postgreSql({
      isolation: 'shared',
      database: 'shared_termination_app',
    }),
    dedicatedDatabase: postgreSql({
      isolation: 'dedicated',
      database: 'dedicated_termination_app',
    }),
  },
  application: {
    setup: './runner-tests/file-isolation/termination/application.jest.setup.ts',
    environment: {
      SHARED_DATABASE_URL: fromContainer('sharedDatabase', 'connectionUri'),
      DATABASE_URL: fromContainer('dedicatedDatabase', 'connectionUri'),
    },
  },
  jest: {
    rootDir: '../..',
    maxWorkers: 1,
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', {
        tsconfig: './runner-tests/file-isolation/tsconfig.jest.json',
        useESM: false,
      }],
    },
    testTimeout: 30_000,
  },
});
