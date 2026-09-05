import { expect, test } from '@jest/globals';
import { applicationContext } from './application.setup.js';

test('stores a note in the PostgreSQL container', async () => {
  const application = applicationContext.current();
  const id = await application.saveNote('saved by concise Jest config');
  await expect(application.findNote(id)).resolves.toBe('saved by concise Jest config');
});

test('publishes and receives a message through the RabbitMQ container', async () => {
  await expect(
    applicationContext.current().publishAndReceive('received by concise Jest config'),
  ).resolves.toBe('received by concise Jest config');
});
