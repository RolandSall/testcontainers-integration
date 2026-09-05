import { expect, test } from 'vitest';
import { Container } from '../container-kind.js';
import { ContainerResources } from '../container-resources.js';
import type { SqlServerResource } from '../sql-server/sql-server-resource.js';
import type { ApplicationLifecycle } from './application-lifecycle.js';
import type { ContainerSource } from './container-source.js';
import { IntegrationEnvironment } from './integration-environment.js';

test(
  'given an application and required container, when the environment runs, then startup and shutdown follow dependency order',
  async () => {
    const events: string[] = [];
    const sqlServer: SqlServerResource = {
      kind: Container.SqlServer,
      host: '127.0.0.1',
      port: 14_333,
      username: 'sa',
      password: 'Container!Sql2026',
      database: 'master',
    };
    const resources = new ContainerResources([sqlServer]);
    const containers: ContainerSource = {
      start: () => {
        events.push('container started');
        return Promise.resolve(resources);
      },
      stop: () => {
        events.push('container stopped');
        return Promise.resolve();
      },
    };
    const application: ApplicationLifecycle<{ readonly listening: true }> = {
      start: () => {
        events.push('application started');
        return Promise.resolve({ listening: true });
      },
      stop: () => {
        events.push('application stopped');
        return Promise.resolve();
      },
    };
    const environment = new IntegrationEnvironment({
      requiredContainers: [Container.SqlServer],
      containers,
      prepareResources: () => {
        events.push('resources prepared');
        return Promise.resolve();
      },
      application,
    });

    const context = await environment.start();
    await environment.stop();

    expect(context.application).toEqual({ listening: true });
    expect(events).toEqual([
      'container started',
      'resources prepared',
      'application started',
      'application stopped',
      'container stopped',
    ]);
  },
);

test(
  'given resource preparation fails, when the environment starts, then the application stays stopped and containers are released',
  async () => {
    const events: string[] = [];
    const containers: ContainerSource = {
      start: () => {
        events.push('containers started');
        return Promise.resolve(new ContainerResources([]));
      },
      stop: () => {
        events.push('containers stopped');
        return Promise.resolve();
      },
    };
    const environment = new IntegrationEnvironment({
      requiredContainers: [],
      containers,
      prepareResources: () => {
        events.push('resources failed');
        return Promise.reject(new Error('resources could not be prepared'));
      },
      application: {
        start: () => {
          events.push('application started');
          return Promise.resolve({ listening: true as const });
        },
        stop: () => Promise.resolve(),
      },
    });

    await expect(environment.start()).rejects.toThrow(
      'resources could not be prepared',
    );
    await environment.stop();

    expect(events).toEqual([
      'containers started',
      'resources failed',
      'containers stopped',
    ]);
  },
);

test(
  'given application startup fails, when the environment starts, then owned container resources are still stopped',
  async () => {
    const events: string[] = [];
    const resources = new ContainerResources([]);
    const containers: ContainerSource = {
      start: () => {
        events.push('containers started');
        return Promise.resolve(resources);
      },
      stop: () => {
        events.push('containers stopped');
        return Promise.resolve();
      },
    };
    const environment = new IntegrationEnvironment({
      requiredContainers: [],
      containers,
      application: {
        start: () => {
          events.push('application failed');
          return Promise.reject(new Error('application could not start'));
        },
        stop: () => Promise.resolve(),
      },
    });

    await expect(environment.start()).rejects.toThrow(
      'application could not start',
    );
    await environment.stop();

    expect(events).toEqual([
      'containers started',
      'application failed',
      'containers stopped',
    ]);
  },
);

test(
  'given application startup and container cleanup fail, when the environment starts, then both failures are reported',
  async () => {
    const startupFailure = new Error('application could not start');
    const cleanupFailure = new Error('containers could not stop');
    const environment = new IntegrationEnvironment({
      requiredContainers: [],
      containers: {
        start: () => Promise.resolve(new ContainerResources([])),
        stop: () => Promise.reject(cleanupFailure),
      },
      application: {
        start: () => Promise.reject(startupFailure),
        stop: () => Promise.resolve(),
      },
    });

    let thrown: unknown;
    try {
      await environment.start();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    if (!(thrown instanceof AggregateError)) {
      throw new Error('Expected an aggregate lifecycle failure');
    }
    expect(thrown.cause).toBe(startupFailure);
    expect(thrown.errors).toEqual([startupFailure, cleanupFailure]);
  },
);
