import { expect, test } from 'vitest';
import { Container, fromContainer, postgreSql, rabbitMq } from '../index.js';
import { CONTAINER_PROJECT_CONTEXT_KEY } from '../project-context.js';
import { defineContainerProject } from './define-container-project.js';

test('given concise Vitest options, when a project is defined, then library lifecycle glue is configured automatically', () => {
  const config = defineContainerProject({
    include: ['test/**/*.integration.test.ts'],
    containers: { database: postgreSql(), messages: rabbitMq() },
    application: {
      setup: './test/application.setup.ts',
      environment: {
        DATABASE_URL: fromContainer('database', 'connectionUri'),
        RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
      },
    },
  });

  expect(config.test?.globalSetup).toEqual([
    '@integration-testing/testcontainers/vitest/project-global-setup',
  ]);
  expect(config.test?.setupFiles).toEqual(['./test/application.setup.ts']);
  expect(config.test?.provide?.[CONTAINER_PROJECT_CONTEXT_KEY]).toEqual({
    version: 1,
    containers: [
      { name: 'database', kind: Container.PostgreSql, options: {} },
      { name: 'messages', kind: Container.RabbitMq, options: {} },
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

test('given an environment reference, when its name or property does not match the declared container, then TypeScript rejects it', () => {
  expect(() => {
    defineContainerProject({
      include: ['test/**/*.integration.test.ts'],
      containers: { database: postgreSql() },
      application: {
        setup: './test/application.setup.ts',
        environment: {
          // @ts-expect-error primaryDatabase is not a declared container name.
          UNKNOWN_DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
          // @ts-expect-error amqpUrl is not a PostgreSQL resource property.
          WRONG_DATABASE_URL: fromContainer('database', 'amqpUrl'),
        },
      },
    });
  }).toThrow('Container project environment references an unknown container: primaryDatabase');
});
