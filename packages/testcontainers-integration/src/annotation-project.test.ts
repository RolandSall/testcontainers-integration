import { describe, expect, test } from 'vitest';
import {
  parseAnnotationProject,
  serializeAnnotationProject,
} from './annotation-project.js';

describe('annotation project configuration', () => {
  test('serializes scanner options for runner transport', () => {
    expect(
      serializeAnnotationProject('.integration.test.ts', true),
    ).toEqual({
      version: 2,
      testFileSuffix: '.integration.test.ts',
      containerLogs: true,
    });
  });

  test.each([
    undefined,
    {},
    { version: 2, testFileSuffix: '' },
    { version: 2, containerLogs: 'yes' },
  ])('rejects invalid transported options: %j', (value) => {
    expect(() => parseAnnotationProject(value)).toThrow(
      /Annotation project/,
    );
  });
});
