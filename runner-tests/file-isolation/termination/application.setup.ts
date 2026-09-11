import { writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { installVitestApplicationIntegrationTestSupport } from '@integration-testing/testcontainers/vitest';

const signalPath = process.env.FILE_ISOLATION_TERMINATION_SIGNAL;
const stopPath = process.env.FILE_ISOLATION_TERMINATION_STOP;

installVitestApplicationIntegrationTestSupport({
  start: async () => {
    const connectionString = process.env.DATABASE_URL;
    const sharedConnectionString = process.env.SHARED_DATABASE_URL;
    if (connectionString === undefined) throw new Error('DATABASE_URL is required');
    if (sharedConnectionString === undefined) throw new Error('SHARED_DATABASE_URL is required');
    if (signalPath === undefined) throw new Error('FILE_ISOLATION_TERMINATION_SIGNAL is required');

    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query('CREATE TABLE startup_side_effect (id integer PRIMARY KEY, value text NOT NULL)');
      await client.query("INSERT INTO startup_side_effect (id, value) VALUES (1, 'written-before-hang')");
      const result = await client.query<{ value: string }>('SELECT value FROM startup_side_effect WHERE id = 1');
      await writeFile(signalPath, JSON.stringify({
        sideEffectCompleted: result.rows[0]?.value === 'written-before-hang',
        dedicatedPort: Number(new URL(connectionString).port),
        sharedPort: Number(new URL(sharedConnectionString).port),
      }));
    } finally {
      await client.end();
    }

    // Simulate an application bootstrap that never resolves. The verifier kills
    // the runner only after it observes the completed database side effect.
    return new Promise<never>(() => undefined);
  },
  stop: async () => {
    if (stopPath !== undefined) await writeFile(stopPath, 'called');
  },
});
