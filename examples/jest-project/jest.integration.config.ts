import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject } from '@integration-testing/testcontainers/jest';

export default defineContainerProject({
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
  jest: {
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.jest.json', useESM: false }],
    },
    testTimeout: 30_000,
  },
});
