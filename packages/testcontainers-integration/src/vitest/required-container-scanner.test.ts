import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { defineContainerCatalog } from '../container-catalog.js';
import { Container } from '../container-kind.js';
import {
  discoverRequiredContainerFiles,
  discoverRequiredContainers,
  discoverSharedContainerInstances,
} from './required-container-scanner.js';

test('discovers two named PostgreSQL containers and one shared RabbitMQ container', async () => {
  const root = await temporaryProject(`
    @RequiredContainer({
      messages: { kind: Container.RabbitMq, isolation: 'shared' },
      primaryDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
      auditDatabase: { kind: Container.PostgreSql, isolation: 'dedicated' },
    })
    class OrderApplicationIntegrationTest {}
  `);
  try {
    const files = await discoverRequiredContainerFiles({ root });
    expect(files).toHaveLength(1);
    expect(files[0]?.containers).toEqual([
      { name: 'messages', kind: Container.RabbitMq, isolation: 'shared' },
      { name: 'primaryDatabase', kind: Container.PostgreSql, isolation: 'dedicated' },
      { name: 'auditDatabase', kind: Container.PostgreSql, isolation: 'dedicated' },
    ]);
    await expect(discoverRequiredContainers({ root })).resolves.toEqual([
      Container.RabbitMq,
      Container.PostgreSql,
    ]);
    await expect(discoverSharedContainerInstances({ root })).resolves.toEqual([
      { name: 'messages', kind: Container.RabbitMq, isolation: 'shared' },
    ]);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('resolves a custom catalog kind from a literal named declaration', async () => {
  const root = await temporaryProject(`
    @RequiredContainer({ database: { kind: Container.Postgres, isolation: 'dedicated' } })
    class PersistenceIntegrationTest {}
  `);
  try {
    await expect(discoverRequiredContainerFiles({
      root,
      containerNames: defineContainerCatalog({ Postgres: 'postgres' }),
    })).resolves.toMatchObject([{
      containers: [{ name: 'database', kind: 'postgres', isolation: 'dedicated' }],
    }]);
  } finally {
    await rm(root, { recursive: true });
  }
});

test.each([
  ['a spread', `@RequiredContainer({ ...containers }) class Test {}`, 'does not allow spreads'],
  ['a computed name', `@RequiredContainer({ ['database']: { kind: Container.PostgreSql, isolation: 'shared' } }) class Test {}`, 'must be literal'],
  ['a duplicate name', `@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'shared' }, database: { kind: Container.PostgreSql, isolation: 'shared' } }) class Test {}`, 'name is duplicated'],
  ['missing isolation', `@RequiredContainer({ database: { kind: Container.PostgreSql } }) class Test {}`, 'requires kind and isolation'],
  ['an invalid isolation', `@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'worker' } }) class Test {}`, "must be 'shared' or 'dedicated'"],
  ['a missing marker', `class Test {}`, 'expected one named @RequiredContainer'],
] as const)('rejects %s with a file-specific error', async (_label, source, message) => {
  const root = await temporaryProject(source);
  try {
    await expect(discoverRequiredContainerFiles({ root })).rejects.toThrow(message);
    await expect(discoverRequiredContainerFiles({ root })).rejects.toThrow(
      'candidate.container.integration.test.ts',
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test('rejects conflicting kinds for the same shared name across files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'container-requirements-'));
  try {
    await Promise.all([
      writeFile(
        join(root, 'one.container.integration.test.ts'),
        `@RequiredContainer({ service: { kind: Container.PostgreSql, isolation: 'shared' } }) class One {}`,
      ),
      writeFile(
        join(root, 'two.container.integration.test.ts'),
        `@RequiredContainer({ service: { kind: Container.RabbitMq, isolation: 'shared' } }) class Two {}`,
      ),
    ]);
    await expect(discoverSharedContainerInstances({ root })).rejects.toThrow(
      'shared container service conflicts',
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test('allows one file to share a name that another file declares as dedicated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'container-requirements-'));
  try {
    await Promise.all([
      writeFile(
        join(root, 'one.container.integration.test.ts'),
        `@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'shared' } }) class One {}`,
      ),
      writeFile(
        join(root, 'two.container.integration.test.ts'),
        `@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'dedicated' } }) class Two {}`,
      ),
    ]);
    await expect(discoverSharedContainerInstances({ root })).resolves.toEqual([
      { name: 'database', kind: Container.PostgreSql, isolation: 'shared' },
    ]);
  } finally {
    await rm(root, { recursive: true });
  }
});

const temporaryProject = async (source: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'container-requirements-'));
  await writeFile(join(root, 'candidate.container.integration.test.ts'), source);
  return root;
};
