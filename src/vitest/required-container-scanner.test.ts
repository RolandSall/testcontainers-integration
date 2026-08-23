import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Container } from '../container-kind.js';
import { defineContainerCatalog } from '../container-catalog.js';
import { discoverRequiredContainers } from './required-container-scanner.js';

test(
  'given decorated integration tests, when requirements are discovered, then every literal container is returned once',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'container-requirements-'));
    try {
      await writeFile(
        join(root, 'candidate.container.integration.test.ts'),
        `
          @RequiredContainer(Container.SqlServer, Container.SqlServer)
          class CandidatePersistenceIntegrationTest {}
        `,
      );

      const requirements = await discoverRequiredContainers({ root });

      expect(requirements).toEqual([Container.SqlServer]);
    } finally {
      await rm(root, { recursive: true });
    }
  },
);

test(
  'given a consumer container catalog, when requirements are discovered, then its custom property resolves to the registered kind',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'custom-container-requirements-'));
    const containerNames = defineContainerCatalog({ Postgres: 'postgres' });
    try {
      await writeFile(
        join(root, 'candidate.container.integration.test.ts'),
        `
          @RequiredContainer(Container.Postgres)
          class CandidatePersistenceIntegrationTest {}
        `,
      );

      const requirements = await discoverRequiredContainers({
        root,
        containerNames,
      });

      expect(requirements).toEqual(['postgres']);
    } finally {
      await rm(root, { recursive: true });
    }
  },
);
