import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const packages = [
  {
    name: '@integration-testing/testcontainers',
    directory: 'packages/testcontainers-integration',
  },
] as const;

const root = resolve(import.meta.dirname, '..');

const main = async (): Promise<void> => {
  const destination = await mkdtemp(join(tmpdir(), 'testcontainers-integration-pack-'));
  try {
    for (const packageEntry of packages) {
      run(
        'bun',
        ['pm', 'pack', '--destination', destination],
        resolve(root, packageEntry.directory),
        `Packing ${packageEntry.directory}`,
      );
    }

    const archives = (await readdir(destination)).filter((file) =>
      file.endsWith('.tgz'),
    );
    if (archives.length !== packages.length) {
      throw new Error(
        `Expected ${packages.length} npm archives, found ${archives.length}`,
      );
    }

    const archiveByPackage = new Map<string, string>();
    for (const packageEntry of packages) {
      const archivePrefix = packageEntry.name
        .replace(/^@/, '')
        .replaceAll('/', '-');
      const archive = archives.find((candidate) =>
        candidate.startsWith(`${archivePrefix}-`),
      );
      if (archive === undefined) {
        throw new Error(`No npm archive was generated for ${packageEntry.name}`);
      }
      archiveByPackage.set(packageEntry.name, join(destination, archive));
      const archivePath = join(destination, archive);
      const archiveSize = (await stat(archivePath)).size;
      if (archiveSize > 250_000) {
        throw new Error(`Archive ${archive} exceeds the 250 KB package budget`);
      }
      const result = spawnSync('tar', ['-tzf', archivePath], {
        encoding: 'utf8',
      });
      const requiredEntries = [
        'package/dist/',
        'package/dist/types/esm/index.d.ts',
        'package/dist/types/cjs/index.d.ts',
        'package/LICENSE',
        'package/README.md',
      ];
      const missing = requiredEntries.filter(
        (entry) => !result.stdout.includes(entry),
      );
      if (result.status !== 0 || missing.length > 0) {
        throw new Error(
          `Archive ${archive} is missing required entries: ${missing.join(', ')}`,
        );
      }
      const forbiddenEntries = [
        'package/src/',
        'package/examples/',
        '.test.',
        'vitest.config',
        'tsconfig.',
      ];
      const leaked = forbiddenEntries.filter((entry) => result.stdout.includes(entry));
      if (leaked.length > 0) {
        throw new Error(`Archive ${archive} contains development files: ${leaked.join(', ')}`);
      }
      const entryCount = result.stdout.trim().split('\n').length;
      if (entryCount > 350) {
        throw new Error(`Archive ${archive} exceeds the 350-entry package budget`);
      }
      const runnerEntries = [
        'package/dist/vitest/annotation-global-setup.js',
        'package/dist/vitest/project-global-setup.js',
        'package/dist/vitest/file-setup.js',
        'package/dist/jest/annotation-global-setup.js',
        'package/dist/jest/annotation-global-teardown.js',
        'package/dist/jest/project-global-setup.js',
        'package/dist/jest/project-global-teardown.js',
        'package/dist/jest/file-setup.js',
        'package/dist/jest/file-setup.cjs',
      ];
      const missingRunnerEntries = runnerEntries.filter(
        (entry) => !result.stdout.includes(entry),
      );
      if (missingRunnerEntries.length > 0) {
        throw new Error(
          `Archive ${archive} is missing runner setup entries: ${missingRunnerEntries.join(', ')}`,
        );
      }
      process.stdout.write(`verified ${archive}\n`);
    }

    await verifyInstalledConsumers(archiveByPackage, destination);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
};

const verifyInstalledConsumers = async (
  archiveByPackage: ReadonlyMap<string, string>,
  parent: string,
): Promise<void> => {
  const consumer = join(parent, 'consumer');
  const archive = (name: string): string => {
    const path = archiveByPackage.get(name);
    if (path === undefined) {
      throw new Error(`Missing archive path for ${name}`);
    }
    return `file:${path}`;
  };

  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'packed-package-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          '@jest/globals': '30.5.1',
          jest: '30.5.1',
          '@integration-testing/testcontainers': archive('@integration-testing/testcontainers'),
          vitest: '4.1.11',
        },
      },
      null,
      2,
    ),
  );
  await Promise.all([
    writeFile(join(consumer, 'esm-smoke.mjs'), esmSmoke),
    writeFile(join(consumer, 'cjs-smoke.cjs'), cjsSmoke),
    writeFile(join(consumer, 'configuration-smoke.ts'), configurationSmoke),
    writeFile(join(consumer, 'tsconfig.json'), typeScriptConfig),
    writeFile(join(consumer, 'vitest-smoke.test.mjs'), vitestSmoke),
    writeFile(join(consumer, 'jest-smoke.test.cjs'), jestSmoke),
  ]);

  run(
    'npm',
    ['install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'],
    consumer,
    'Installing packed packages',
  );
  run('node', ['esm-smoke.mjs'], consumer, 'Loading packed ESM exports');
  run('node', ['cjs-smoke.cjs'], consumer, 'Loading packed CommonJS exports');
  run(
    join(consumer, 'node_modules/.bin/tsc'),
    ['--noEmit', '-p', 'tsconfig.json'],
    consumer,
    'Type-checking packed project configuration',
  );
  run(
    join(consumer, 'node_modules/.bin/vitest'),
    ['run', 'vitest-smoke.test.mjs'],
    consumer,
    'Running packed Vitest consumer',
  );
  run(
    join(consumer, 'node_modules/.bin/jest'),
    ['--runInBand', 'jest-smoke.test.cjs'],
    consumer,
    'Running packed Jest consumer',
  );
  process.stdout.write('verified isolated ESM, CommonJS, Vitest, and Jest consumers\n');
};

const run = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  action: string,
): void => {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${action} failed:\n${result.stdout}${result.stderr}`,
      { cause: result.error },
    );
  }
};

const esmSmoke = `
import assert from 'node:assert/strict';
import * as containers from '@integration-testing/testcontainers';
import * as vitestAdapter from '@integration-testing/testcontainers/vitest';
import * as jestAdapter from '@integration-testing/testcontainers/jest';

assert.equal(typeof containers.ContainerRuntime, 'function');
assert.equal(typeof vitestAdapter.createVitestContainerGlobalSetup, 'function');
assert.equal(typeof jestAdapter.createJestContainerGlobalSetup, 'function');
assert.equal(typeof containers.postgreSql, 'function');
assert.equal(typeof containers.rabbitMq, 'function');
assert.equal(typeof containers.fromContainer, 'function');
assert.equal(typeof vitestAdapter.defineContainerProject, 'function');
assert.equal(typeof jestAdapter.defineContainerProject, 'function');
assert.equal(typeof vitestAdapter.defineAnnotationProject, 'function');
assert.equal(typeof jestAdapter.defineAnnotationProject, 'function');
const vitestAnnotations = vitestAdapter.defineAnnotationProject({
  application: './test/application.setup.ts',
});
assert.deepEqual(vitestAnnotations.test.globalSetup, [
  '@integration-testing/testcontainers/vitest/annotation-global-setup',
]);
const jestAnnotations = jestAdapter.defineAnnotationProject({
  application: './test/application.setup.ts',
});
assert.equal(
  jestAnnotations.globalSetup,
  '@integration-testing/testcontainers/jest/annotation-global-setup',
);
const vitestProject = vitestAdapter.defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: {
    primaryDatabase: containers.postgreSql({ isolation: 'dedicated' }),
    auditDatabase: containers.postgreSql({ isolation: 'dedicated', database: 'audit' }),
  },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: containers.fromContainer('primaryDatabase', 'connectionUri'),
      AUDIT_DATABASE_URL: containers.fromContainer('auditDatabase', 'connectionUri'),
    },
  },
});
assert.deepEqual(vitestProject.test.globalSetup, [
  '@integration-testing/testcontainers/vitest/project-global-setup',
]);
assert.deepEqual(vitestProject.test.setupFiles, [
  '@integration-testing/testcontainers/vitest/file-setup',
  './test/application.setup.ts',
]);
const jestProject = jestAdapter.defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { messages: containers.rabbitMq({ isolation: 'shared' }) },
});
assert.equal(
  jestProject.globalSetup,
  '@integration-testing/testcontainers/jest/project-global-setup',
);
const isolatedVitestProject = vitestAdapter.defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: containers.postgreSql({ isolation: 'dedicated' }) },
  vitest: { maxWorkers: 2 },
});
assert.equal(isolatedVitestProject.test.maxWorkers, 2);
const isolatedJestProject = jestAdapter.defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: containers.postgreSql({ isolation: 'dedicated' }) },
  jest: { maxWorkers: 9 },
});
assert.equal(isolatedJestProject.maxWorkers, 9);
`;

const cjsSmoke = `
const assert = require('node:assert/strict');
const containers = require('@integration-testing/testcontainers');
const jestAdapter = require('@integration-testing/testcontainers/jest');

assert.equal(typeof containers.ContainerRuntime, 'function');
assert.equal(typeof jestAdapter.createJestContainerGlobalSetup, 'function');
assert.equal(typeof containers.postgreSql, 'function');
assert.equal(typeof containers.fromContainer, 'function');
assert.equal(typeof jestAdapter.defineContainerProject, 'function');
assert.equal(typeof jestAdapter.defineAnnotationProject, 'function');
const jestAnnotations = jestAdapter.defineAnnotationProject({
});
assert.equal(
  jestAnnotations.globalTeardown,
  '@integration-testing/testcontainers/jest/annotation-global-teardown',
);
const jestProject = jestAdapter.defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: containers.postgreSql({ isolation: 'dedicated' }) },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: containers.fromContainer('database', 'connectionUri'),
    },
  },
});
assert.equal(
  jestProject.globalTeardown,
  '@integration-testing/testcontainers/jest/project-global-teardown',
);
const isolatedJestProject = jestAdapter.defineContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: containers.postgreSql({ isolation: 'dedicated' }) },
  jest: { maxWorkers: 2 },
});
assert.equal(isolatedJestProject.maxWorkers, 2);
assert.throws(
  () => require('@integration-testing/testcontainers/vitest'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
`;

const configurationSmoke = `
import { fromContainer, postgreSql, rabbitMq } from '@integration-testing/testcontainers';
import { defineContainerProject as defineJestContainerProject } from '@integration-testing/testcontainers/jest';
import { defineAnnotationProject as defineJestAnnotationProject } from '@integration-testing/testcontainers/jest';
import { defineContainerProject as defineVitestContainerProject } from '@integration-testing/testcontainers/vitest';
import { defineAnnotationProject as defineVitestAnnotationProject } from '@integration-testing/testcontainers/vitest';

const containers = {
  primaryDatabase: postgreSql({ isolation: 'dedicated' }),
  auditDatabase: postgreSql({ isolation: 'dedicated', database: 'audit' }),
  messages: rabbitMq({ isolation: 'shared' }),
};

defineVitestAnnotationProject({
  application: './test/application.setup.ts',
});

defineJestAnnotationProject({
  application: './test/application.setup.ts',
});

defineVitestContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers,
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
      AUDIT_DATABASE_URL: fromContainer('auditDatabase', 'connectionUri'),
      RABBITMQ_URL: fromContainer('messages', 'amqpUrl'),
    },
  },
});

defineVitestContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: postgreSql({ isolation: 'dedicated' }) },
  vitest: { maxWorkers: 2 },
});

defineJestContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers,
  application: {
    setup: './test/application.setup.ts',
    environment: {
      DATABASE_URL: fromContainer('primaryDatabase', 'connectionUri'),
    },
  },
});

defineJestContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: postgreSql({ isolation: 'dedicated' }) },
  jest: { maxWorkers: 2 },
});

defineVitestContainerProject({
  include: ['test/**/*.integration.test.ts'],
  containers: { database: postgreSql({ isolation: 'shared' }) },
  application: {
    setup: './test/application.setup.ts',
    environment: {
      // @ts-expect-error missingDatabase is not a declared container name.
      UNKNOWN_DATABASE_URL: fromContainer('missingDatabase', 'connectionUri'),
      // @ts-expect-error amqpUrl does not belong to a PostgreSQL resource.
      WRONG_DATABASE_URL: fromContainer('database', 'amqpUrl'),
    },
  },
});
`;

const typeScriptConfig = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: 'ES2023',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    skipLibCheck: false,
  },
  include: ['configuration-smoke.ts'],
}, null, 2);

const vitestSmoke = `
import { expect, test } from 'vitest';
import { Container, ContainerResources } from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';

test('packed Vitest consumer resolves the public runner API', () => {
  const resources = new ContainerResources([]);
  expect(resources.has(Container.SqlServer)).toBe(false);
  expect(createVitestContainerGlobalSetup).toBeTypeOf('function');
});
`;

const jestSmoke = `
const { expect, test } = require('@jest/globals');
const { Container, ContainerResources } = require('@integration-testing/testcontainers');
const { createJestContainerGlobalSetup } = require('@integration-testing/testcontainers/jest');

test('packed Jest consumer resolves the public runner API', () => {
  const resources = new ContainerResources([]);
  expect(resources.has(Container.SqlServer)).toBe(false);
  expect(typeof createJestContainerGlobalSetup).toBe('function');
});
`;

await main();
