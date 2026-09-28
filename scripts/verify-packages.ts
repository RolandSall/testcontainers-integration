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
const MAX_ARCHIVE_BYTES = 275_000;

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
      if (archiveSize > MAX_ARCHIVE_BYTES) {
        throw new Error(
          `Archive ${archive} is ${archiveSize} bytes and exceeds the ${MAX_ARCHIVE_BYTES}-byte package budget`,
        );
      }
      const result = spawnSync('tar', ['-tzf', archivePath], {
        encoding: 'utf8',
      });
      const entries = result.stdout.trim().split('\n');
      const unexpectedEntries = entries.filter((entry) =>
        entry !== 'package/package.json' &&
        entry !== 'package/README.md' &&
        entry !== 'package/LICENSE' &&
        !entry.startsWith('package/dist/'),
      );
      if (result.status !== 0 || unexpectedEntries.length > 0) {
        throw new Error(
          `Archive ${archive} contains entries outside the publication allowlist: ${unexpectedEntries.join(', ')}`,
        );
      }
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
      if (missing.length > 0) {
        throw new Error(
          `Archive ${archive} is missing required entries: ${missing.join(', ')}`,
        );
      }
      const forbiddenEntries = [
        'package/src/',
        'package/examples/',
        'package/dashboard-template.html',
        '.test.',
        'vitest.config',
        'tsconfig.',
      ];
      const leaked = forbiddenEntries.filter((entry) => result.stdout.includes(entry));
      if (leaked.length > 0) {
        throw new Error(`Archive ${archive} contains development files: ${leaked.join(', ')}`);
      }
      const entryCount = entries.length;
      if (entryCount > 350) {
        throw new Error(`Archive ${archive} exceeds the 350-entry package budget`);
      }
      const runnerEntries = [
        'package/dist/vitest/annotation-global-setup.js',
        'package/dist/vitest/project-global-setup.js',
        'package/dist/vitest/file-setup.js',
        'package/dist/vitest/dashboard-reporter.js',
        'package/dist/jest/annotation-global-setup.js',
        'package/dist/jest/annotation-global-teardown.js',
        'package/dist/jest/project-global-setup.js',
        'package/dist/jest/project-global-teardown.js',
        'package/dist/jest/file-setup.js',
        'package/dist/jest/file-setup.cjs',
        'package/dist/jest/dashboard-reporter.js',
        'package/dist/jest/dashboard-reporter.cjs',
      ];
      const missingRunnerEntries = runnerEntries.filter(
        (entry) => !result.stdout.includes(entry),
      );
      if (missingRunnerEntries.length > 0) {
        throw new Error(
          `Archive ${archive} is missing runner setup entries: ${missingRunnerEntries.join(', ')}`,
        );
      }
      verifyCompatibilityManifest(archivePath, archive);
      process.stdout.write(
        `verified ${archive} (${archiveSize} bytes, ${entryCount} allowlisted entries)\n`,
      );
    }

    await verifyInstalledConsumers(archiveByPackage, destination);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
};

const verifyCompatibilityManifest = (archivePath: string, archive: string): void => {
  const result = spawnSync('tar', ['-xOzf', archivePath, 'package/package.json'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Could not read package.json from ${archive}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isRecord(parsed)) {
    throw new Error(`Archive ${archive} has an invalid package manifest`);
  }
  const exportsMap = parsed.exports;
  if (!isRecord(exportsMap)) {
    throw new Error(`Archive ${archive} has an invalid exports map`);
  }
  const stableExportPaths = [
    '.',
    './container-resource-map',
    './vitest',
    './vitest/project-global-setup',
    './vitest/annotation-global-setup',
    './vitest/file-setup',
    './jest',
    './jest/project-global-setup',
    './jest/project-global-teardown',
    './jest/annotation-global-setup',
    './jest/annotation-global-teardown',
    './jest/file-setup',
  ];
  const missingExports = stableExportPaths.filter((path) => !(path in exportsMap));
  if (missingExports.length > 0) {
    throw new Error(
      `Archive ${archive} removed 0.1.0 export paths: ${missingExports.join(', ')}`,
    );
  }
  if (
    !isStringRecord(parsed.peerDependencies) ||
    parsed.peerDependencies.jest !== '>=30 <31' ||
    parsed.peerDependencies.vitest !== '>=4 <5'
  ) {
    throw new Error(`Archive ${archive} changed its supported runner ranges`);
  }
  if (!isStringRecord(parsed.engines) || parsed.engines.node !== '>=22.22') {
    throw new Error(`Archive ${archive} changed its supported Node.js range`);
  }
  if (!isStringRecord(parsed.dependencies)) {
    throw new Error(`Archive ${archive} has invalid runtime dependencies`);
  }
  const expectedDependencies = [
    '@testcontainers/mssqlserver',
    '@testcontainers/mongodb',
    '@testcontainers/postgresql',
    '@testcontainers/rabbitmq',
    'testcontainers',
    'typescript',
  ];
  const actualDependencies = Object.keys(parsed.dependencies).sort();
  if (JSON.stringify(actualDependencies) !== JSON.stringify(expectedDependencies.sort())) {
    throw new Error(
      `Archive ${archive} has unexpected runtime dependencies: ${actualDependencies.join(', ')}`,
    );
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');

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
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as containers from '@integration-testing/testcontainers';
import * as vitestAdapter from '@integration-testing/testcontainers/vitest';
import * as jestAdapter from '@integration-testing/testcontainers/jest';
import VitestDashboardReporter from '@integration-testing/testcontainers/vitest/dashboard-reporter';
import JestDashboardReporter from '@integration-testing/testcontainers/jest/dashboard-reporter';

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
assert.equal(typeof VitestDashboardReporter, 'function');
assert.equal(typeof JestDashboardReporter, 'function');
for (const name of [
  'Container',
  'defineContainerCatalog',
  'fromContainer',
  'mongoDb',
  'postgreSql',
  'rabbitMq',
  'sqlServer',
  'ContainerRegistry',
  'ContainerResources',
  'ContainerRuntime',
  'ConsoleIntegrationTestLogger',
  'consoleIntegrationTestLogger',
  'createContainerLogConsumer',
  'createDefaultContainerRegistry',
  'GenericTestContainer',
  'RequiredContainer',
  'requiredContainersFor',
  'ApplicationIntegrationTest',
  'isApplicationIntegrationTest',
  'IntegrationEnvironment',
  'OwnedContainerSource',
  'ProvidedContainerSource',
  'startTestcontainersNetwork',
  'SqlServerTestContainer',
  'PostgreSqlTestContainer',
  'MongoDbTestContainer',
  'RabbitMqTestContainer',
]) {
  assert.ok(name in containers, 'missing 0.1.0 root export: ' + name);
}
for (const name of [
  'CONTAINER_RESOURCES_CONTEXT_KEY',
  'createVitestContainerGlobalSetup',
  'injectedContainerProject',
  'injectedContainerResources',
  'discoverRequiredContainers',
  'installVitestApplicationIntegrationTestSupport',
  'configureVitestContainerFileSupport',
  'defineAnnotationProject',
  'defineVitestAnnotationProject',
  'defineContainerProject',
  'defineVitestContainerProject',
]) {
  assert.ok(name in vitestAdapter, 'missing 0.1.0 Vitest export: ' + name);
}
for (const name of [
  'JEST_CONTAINER_RESOURCES_PATH_ENV',
  'createJestContainerGlobalSetup',
  'injectedContainerProject',
  'injectedContainerResources',
  'installJestApplicationIntegrationTestSupport',
  'configureJestContainerFileSupport',
  'discoverRequiredContainers',
  'defineAnnotationProject',
  'defineJestAnnotationProject',
  'defineContainerProject',
  'defineJestContainerProject',
]) {
  assert.ok(name in jestAdapter, 'missing 0.1.0 Jest export: ' + name);
}
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
  dashboard: true,
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
assert.deepEqual(vitestProject.test.reporters, [
  'default',
  '@integration-testing/testcontainers/vitest/dashboard-reporter',
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

const dashboardRoot = await mkdtemp(join(tmpdir(), 'packed-dashboard-esm-'));
const dashboardLifecycle = vitestAdapter.createVitestContainerGlobalSetup({
  root: dashboardRoot,
  registry: new containers.ContainerRegistry(),
  requiredContainerInstances: [],
  dashboard: { open: false, outputDirectory: 'reports' },
});
try {
  await dashboardLifecycle.setup({ provide() {} });
  await dashboardLifecycle.teardown();
  const [runDirectory] = await readdir(join(dashboardRoot, 'reports'));
  assert.ok(runDirectory);
  const dashboardReport = await readFile(
    join(dashboardRoot, 'reports', runDirectory, 'index.html'),
    'utf8',
  );
  assert.match(dashboardReport, /^<!doctype html>/);
  assert.match(dashboardReport, /Vitest integration report/);
  assert.doesNotMatch(dashboardReport, /__INTEGRATION_DASHBOARD_(?:TITLE|STYLES|STATE|SCRIPT)__/);
} finally {
  await dashboardLifecycle.teardown();
  await rm(dashboardRoot, { recursive: true, force: true });
}
`;

const cjsSmoke = `
const assert = require('node:assert/strict');
const containers = require('@integration-testing/testcontainers');
const jestAdapter = require('@integration-testing/testcontainers/jest');
const JestDashboardReporter = require('@integration-testing/testcontainers/jest/dashboard-reporter');

assert.equal(typeof containers.ContainerRuntime, 'function');
assert.equal(typeof jestAdapter.createJestContainerGlobalSetup, 'function');
assert.equal(typeof containers.postgreSql, 'function');
assert.equal(typeof containers.fromContainer, 'function');
assert.equal(typeof jestAdapter.defineContainerProject, 'function');
assert.equal(typeof jestAdapter.defineAnnotationProject, 'function');
assert.equal(typeof JestDashboardReporter.default, 'function');
const jestAnnotations = jestAdapter.defineAnnotationProject({
});
assert.equal(
  jestAnnotations.globalTeardown,
  '@integration-testing/testcontainers/jest/annotation-global-teardown',
);
const jestProject = jestAdapter.defineContainerProject({
  dashboard: true,
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
assert.deepEqual(jestProject.reporters, [
  'default',
  '@integration-testing/testcontainers/jest/dashboard-reporter',
]);
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
  dashboard: true,
  application: './test/application.setup.ts',
});

defineJestAnnotationProject({
  dashboard: { open: false, outputDirectory: 'test-results/integration-testing' },
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
