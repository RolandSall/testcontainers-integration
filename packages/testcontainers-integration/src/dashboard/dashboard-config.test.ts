import { describe, expect, test } from 'vitest';
import {
  parseIntegrationDashboard,
  serializeIntegrationDashboard,
} from './dashboard-config.js';

describe('integration dashboard configuration', () => {
  test('is disabled by default and expands the true shorthand', () => {
    expect(serializeIntegrationDashboard(undefined)).toBeUndefined();
    expect(serializeIntegrationDashboard(false)).toBeUndefined();
    expect(serializeIntegrationDashboard(true)).toEqual({
      open: false,
      outputDirectory: 'test-results/integration-testing',
    });
  });

  test('keeps explicit safe options', () => {
    expect(serializeIntegrationDashboard({
      open: true,
      outputDirectory: 'artifacts/dashboard',
    })).toEqual({
      open: true,
      outputDirectory: 'artifacts/dashboard',
    });
  });

  test.each([
    true,
    { open: 'yes' },
    { outputDirectory: '' },
    { outputDirectory: '../outside' },
    { outputDirectory: '/tmp/outside' },
    { extra: true },
  ])('rejects malformed or unsafe transported options: %j', (value) => {
    expect(() => parseIntegrationDashboard(value)).toThrow(/dashboard/i);
  });
});
