import { expect, test } from 'vitest';
import { ANNOTATION_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { defineAnnotationProject } from './define-annotation-project.js';

test('given annotation options, when a Jest project is defined, then scanner lifecycle glue is automatic', () => {
  const config = defineAnnotationProject({
    application: './test/application.jest.setup.ts',
    testFileSuffix: '.container.integration.test.ts',
    containerLogs: true,
    jest: { testTimeout: 30_000 },
  });

  expect(config.testMatch).toEqual(['**/*.container.integration.test.ts']);
  expect(config.globalSetup).toBe(
    '@integration-testing/testcontainers/jest/annotation-global-setup',
  );
  expect(config.globalTeardown).toBe(
    '@integration-testing/testcontainers/jest/annotation-global-teardown',
  );
  expect(config.setupFilesAfterEnv).toEqual([
    '@integration-testing/testcontainers/jest/file-setup',
    './test/application.jest.setup.ts',
  ]);
  expect(config.globals?.[ANNOTATION_PROJECT_CONTEXT_KEY]).toEqual({
    version: 2,
    testFileSuffix: '.container.integration.test.ts',
    containerLogs: true,
  });
  expect(config.testTimeout).toBe(30_000);
});

test('annotation projects preserve the configured Jest worker count', () => {
  const config = defineAnnotationProject({
    jest: { maxWorkers: 9 },
  });

  expect(config.maxWorkers).toBe(9);
});
