import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { StartedNetwork } from 'testcontainers';
import { Container, type Container as TestContainer } from '../container-kind.js';
import type { ContainerStartOptions } from '../container-start-options.js';
import { createContainerLogConsumer } from '../logging/container-log-consumer.js';
import type { PostgreSqlResource } from './postgresql-resource.js';

const DEFAULT_IMAGE = 'postgres:16-alpine';

/** Configuration for the built-in PostgreSQL adapter. */
export interface PostgreSqlTestContainerOptions {
  readonly image?: string;
  readonly database?: string;
  readonly username?: string;
  readonly password?: string;
  readonly startupTimeoutMs?: number;
}

/** Testcontainers-backed PostgreSQL adapter. */
export class PostgreSqlTestContainer implements TestContainer<PostgreSqlResource> {
  readonly kind = Container.PostgreSql;
  private started: StartedPostgreSqlContainer | undefined;
  private startPromise: Promise<PostgreSqlResource> | undefined;
  private stopped = false;

  constructor(private readonly options: PostgreSqlTestContainerOptions = {}) {}

  start(options: ContainerStartOptions = {}): Promise<PostgreSqlResource> {
    if (this.stopped) {
      return Promise.reject(new Error('PostgreSQL container has already been stopped'));
    }
    this.startPromise ??= this.startOnce(options);
    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    try {
      await this.startPromise;
    } catch {
      return;
    }
    const started = this.started;
    this.started = undefined;
    if (started !== undefined) await started.stop();
  }

  private async startOnce(options: ContainerStartOptions): Promise<PostgreSqlResource> {
    const image = this.options.image ?? DEFAULT_IMAGE;
    let container = new PostgreSqlContainer(image).withStartupTimeout(
      this.options.startupTimeoutMs ?? 120_000,
    );
    if (this.options.database !== undefined) container = container.withDatabase(this.options.database);
    if (this.options.username !== undefined) container = container.withUsername(this.options.username);
    if (this.options.password !== undefined) container = container.withPassword(this.options.password);
    if (options.containerLogs === true && options.logger !== undefined) {
      container = container.withLogConsumer(createContainerLogConsumer(this.kind, options.logger));
    }
    if (options.network !== undefined) {
      container = container.withNetwork(options.network.native as StartedNetwork);
    }
    if (options.networkAliases !== undefined) {
      container = container.withNetworkAliases(...options.networkAliases);
    }
    options.logger?.info(`container:${this.kind}`, `preparing image ${image}`);
    try {
      const started = await container.start();
      this.started = started;
      const resource: PostgreSqlResource = {
        kind: this.kind,
        host: started.getHost(),
        port: started.getPort(),
        database: started.getDatabase(),
        username: started.getUsername(),
        password: started.getPassword(),
        connectionUri: started.getConnectionUri(),
      };
      options.logger?.info(`container:${this.kind}`, `accepting connections on ${resource.host}:${resource.port}`);
      return resource;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }
}
