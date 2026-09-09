import { expect, test } from 'vitest';
import { Container, fromContainer, postgreSql, rabbitMq } from '../index.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { defineContainerProject } from './define-container-project.js';

test('given concise Jest options, when a project is defined, then library setup and teardown are configured automatically', () => {
  const config = defineContainerProject({
    include: ['**/test/**/*.integration.test.ts'],
    containers: {
      database: postgreSql({ isolation: 'dedicated' }),
      messages: rabbitMq({ isolation: 'shared' }),
    },
    application: {
      setup: './test/application.setup.ts',
      environment: {
        DATABASE_URL: fromContainer('database', 'connectionUri'),
        RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
      },
    },
    jest: { testTimeout: 30_000 },
  });

  expect(config.globalSetup).toBe('@integration-testing/testcontainers/jest/project-global-setup');
  expect(config.globalTeardown).toBe('@integration-testing/testcontainers/jest/project-global-teardown');
  expect(config.setupFilesAfterEnv).toEqual([
    '@integration-testing/testcontainers/jest/file-setup',
    './test/application.setup.ts',
  ]);
  expect(config.globals?.[CONTAINER_PROJECT_CONTEXT_KEY]).toEqual({
    version: 2,
    containers: [
      { name: 'database', kind: Container.PostgreSql, isolation: 'dedicated', options: {} },
      { name: 'messages', kind: Container.RabbitMq, isolation: 'shared', options: {} },
    ],
    environment: {
      DATABASE_URL: {
        source: 'container',
        container: 'database',
        property: 'connectionUri',
      },
      RABBITMQ_URL: {
        source: 'container',
        container: 'messages',
        property: 'amqpUrl',
      },
    },
  });
});

test('runner worker settings are preserved and are not derived from container isolation', () => {
  const config = defineContainerProject({
    include: ['**/test/**/*.integration.test.ts'],
    containers: { database: postgreSql({ isolation: 'dedicated' }) },
    jest: { maxWorkers: 9 },
  });

  expect(config.maxWorkers).toBe(9);
  expect(config.globals?.[CONTAINER_PROJECT_CONTEXT_KEY]).toMatchObject({
    version: 2,
    containers: [{ name: 'database', isolation: 'dedicated' }],
  });
});
