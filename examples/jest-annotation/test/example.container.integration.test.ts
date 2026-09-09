import { expect, test } from '@jest/globals';
import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { applicationContext } from './application.jest.setup.js';

@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  database: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class ExampleApplicationIntegrationTest {}

test(
  'given PostgreSQL is ready, when the application saves a note, then the note can be read back',
  async () => {
    const application = applicationContext.current();
    const id = await application.saveNote('saved by Jest annotations');
    await expect(application.findNote(id)).resolves.toBe('saved by Jest annotations');
  },
);

test(
  'given RabbitMQ is ready, when the application publishes a message, then a consumer receives it',
  async () => {
    await expect(
      applicationContext.current().publishAndReceive('received by Jest annotations'),
    ).resolves.toBe('received by Jest annotations');
  },
);
