import { expect, test } from 'vitest';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { defineAnnotationProject } from './define-annotation-project.js';

test('given annotation options, when a Vitest project is defined, then scanner lifecycle glue is automatic', () => {
  const config = defineAnnotationProject({
    application: './test/application.vitest.setup.ts',
    testFileSuffix: '.container.integration.test.ts',
    hookTimeout: 360_000,
    testTimeout: 30_000,
    containerLogs: true,
  });

  expect(config.test?.include).toEqual([
    '**/*.container.integration.test.ts',
  ]);
  expect(config.test?.globalSetup).toEqual([
    '@integration-testing/testcontainers/vitest/annotation-global-setup',
  ]);
  expect(config.test?.setupFiles).toEqual([
    './test/application.vitest.setup.ts',
  ]);
  expect(config.test?.provide?.[ANNOTATION_PROJECT_CONTEXT_KEY]).toEqual({
    version: 1,
    testFileSuffix: '.container.integration.test.ts',
    containerLogs: true,
  });
});
