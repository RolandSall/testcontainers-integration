import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, expectTypeOf, test } from 'vitest';
import {
  ApplicationIntegrationTest,
  consumeApplicationIntegrationTestClasses,
} from '../application-integration-test.js';
import { Container } from '../container-kind.js';
import { RequiredContainer } from '../required-container.js';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from './context-key.js';
import { installJestApplicationIntegrationTestSupport } from './install-jest-application-integration-test-support.js';

interface FakeApiApplication {
  readonly databasePort: number;
}

interface MutableJestHooks {
  beforeAll?: (action: () => Promise<void>) => void;
  afterAll?: (action: () => Promise<void>) => void;
}

test(
  'given an annotated Jest file, when registered hooks run, then its typed application starts with restored resources and stops afterward',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jest-application-support-'));
    const resourcePath = join(directory, 'resources.json');
    const hooks = globalThis as typeof globalThis & MutableJestHooks;
    let beforeAction: (() => Promise<void>) | undefined;
    let afterAction: (() => Promise<void>) | undefined;
    const events: string[] = [];
    hooks.beforeAll = (action) => {
      beforeAction = action;
    };
    hooks.afterAll = (action) => {
      afterAction = action;
    };
    try {
      await writeFile(
        resourcePath,
        JSON.stringify({
          [Container.SqlServer]: {
            kind: Container.SqlServer,
            host: '127.0.0.1',
            port: 14_333,
            username: 'sa',
            password: 'Container!Sql2026',
            database: 'master',
          },
        }),
      );
      process.env[JEST_CONTAINER_RESOURCES_PATH_ENV] = resourcePath;
      const context = installJestApplicationIntegrationTestSupport<FakeApiApplication>({
        start: (resources) => {
          events.push('application started');
          return Promise.resolve({
            databasePort: resources.get(Container.SqlServer).port,
          });
        },
        stop: () => {
          events.push('application stopped');
          return Promise.resolve();
        },
      });

      @RequiredContainer(Container.SqlServer)
      @ApplicationIntegrationTest
      class CandidateApiIntegrationTest {}

      expect(CandidateApiIntegrationTest).toBeDefined();
      await requireAction(beforeAction, 'beforeAll')();
      const application = context.current();
      expectTypeOf(application).toEqualTypeOf<FakeApiApplication>();
      expect(application).toEqual({ databasePort: 14_333 });
      await requireAction(afterAction, 'afterAll')();

      expect(events).toEqual(['application started', 'application stopped']);
    } finally {
      delete hooks.beforeAll;
      delete hooks.afterAll;
      delete process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
      consumeApplicationIntegrationTestClasses();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  'given an unannotated Jest file, when registered hooks run, then the application remains inactive',
  async () => {
    const hooks = globalThis as typeof globalThis & MutableJestHooks;
    let beforeAction: (() => Promise<void>) | undefined;
    let afterAction: (() => Promise<void>) | undefined;
    hooks.beforeAll = (action) => {
      beforeAction = action;
    };
    hooks.afterAll = (action) => {
      afterAction = action;
    };
    try {
      const context = installJestApplicationIntegrationTestSupport({
        start: () => Promise.resolve({ listening: true }),
        stop: () => Promise.resolve(),
      });

      await requireAction(beforeAction, 'beforeAll')();
      await requireAction(afterAction, 'afterAll')();

      expect(() => context.current()).toThrow(
        'Application integration-test context is not active',
      );
    } finally {
      delete hooks.beforeAll;
      delete hooks.afterAll;
      consumeApplicationIntegrationTestClasses();
    }
  },
);

const requireAction = (
  action: (() => Promise<void>) | undefined,
  name: string,
): (() => Promise<void>) => {
  if (action === undefined) {
    throw new Error(`Jest did not register ${name}`);
  }
  return action;
};
