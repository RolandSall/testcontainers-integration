import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { runVitestFile } from '../support/run-vitest-file.js';

@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
  auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class SecondVitestFileIsolationTest {}

runVitestFile('second');
