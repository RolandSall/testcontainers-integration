import {
  Container,
} from '@integration-testing/testcontainers';
import { injectedContainerResources } from '@integration-testing/testcontainers/vitest';
import { expect, test } from 'vitest';

const demoDurations = [40, 55, 70, 85, 100, 115, 130, 145, 160, 175, 190, 205, 220, 235, 250, 265];

test.each(demoDurations)('completes dashboard demo work in %i ms', async (durationMs) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
});

test.skip('shows a skipped dashboard test', () => undefined);

test('remains visibly in progress for two minutes', async () => {
  const resources = injectedContainerResources();
  expect(resources.getNamed('messages', Container.RabbitMq).port).toBeGreaterThan(0);
  expect(resources.getNamed('database', Container.PostgreSql).port).toBeGreaterThan(0);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 120_000);
  });
});
