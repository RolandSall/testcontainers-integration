import { writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';

const reportPath = process.env.FILE_ISOLATION_FAILURE_REPORT;

installVitestApplicationIntegrationTestSupport({
  start: async () => {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error('DATABASE_URL is required');
    if (reportPath === undefined) throw new Error('FILE_ISOLATION_FAILURE_REPORT is required');
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query('CREATE TABLE bootstrap_side_effect (id integer PRIMARY KEY)');
      await client.query('INSERT INTO bootstrap_side_effect (id) VALUES (1)');
      await writeFile(reportPath, JSON.stringify({ sideEffectCompleted: true }));
    } finally {
      await client.end();
    }
    throw new Error('expected application bootstrap failure');
  },
  stop: async () => {
    if (reportPath !== undefined) {
      await writeFile(reportPath, JSON.stringify({ stopWasCalled: true }));
    }
  },
});
