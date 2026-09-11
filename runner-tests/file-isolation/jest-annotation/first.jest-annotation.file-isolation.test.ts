import {
  ApplicationIntegrationTest,
  Container,
  RequiredContainer,
} from '@integration-testing/testcontainers';
import { runJestFile } from '../support/run-jest-file';

@RequiredContainer({
  messages: { kind: Container.RabbitMq, isolation: 'shared' },
  primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
  auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
})
@ApplicationIntegrationTest
export class FirstJestFileIsolationTest {}

runJestFile('first');
