import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { expect, test } from 'vitest';
import { applicationContext } from './application.vitest.setup.js';

@RequiredContainer([
  Container.RabbitMq,
  Container.PostgreSql,
  Container.SqlServer,
])
@ApplicationIntegrationTest
export class ExampleApplicationIntegrationTest {}

test(
  'given SQL Server is ready, when the annotated application starts, then it receives the mapped port',
  () => {
    expect(applicationContext.current().sqlServerPort).toBeGreaterThan(0);
  },
);

test(
  'given PostgreSQL is ready, when the application saves a note, then the note can be read back',
  async () => {
    const application = applicationContext.current();
    const id = await application.saveNote('saved by Vitest annotations');
    await expect(application.findNote(id)).resolves.toBe('saved by Vitest annotations');
  },
);

test(
  'given RabbitMQ is ready, when the application publishes a message, then a consumer receives it',
  async () => {
    await expect(
      applicationContext.current().publishAndReceive('received by Vitest annotations'),
    ).resolves.toBe('received by Vitest annotations');
  },
);
