import { defineAnnotationProject } from '@integration-testing/testcontainers/jest';

export default defineAnnotationProject({
  application: './test/application.jest.setup.ts',
  jest: {
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.jest.json', useESM: false }],
    },
  },
});
