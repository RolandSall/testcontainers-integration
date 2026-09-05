import {
  MSSQLServerContainer,
  type StartedMSSQLServerContainer,
} from '@testcontainers/mssqlserver';
import type { StartedNetwork } from 'testcontainers';
import { Container, type Container as TestContainer } from '../container-kind.js';
import type { ContainerStartOptions } from '../container-start-options.js';
import { createContainerLogConsumer } from '../logging/container-log-consumer.js';
import type { SqlServerResource } from './sql-server-resource.js';

const DEFAULT_IMAGE = 'mcr.microsoft.com/mssql/server:2022-latest';
const DEFAULT_PASSWORD = 'Container!Sql2026';

/** Options forwarded to the Testcontainers SQL Server adapter. */
export interface SqlServerTestContainerOptions {
  /** Docker image. Defaults to SQL Server 2022 latest. */
  readonly image?: string;
  /** SQL Server administrator password used only for this container. */
  readonly password?: string;
  /** Optional Docker platform override, such as `linux/amd64`. */
  readonly platform?: string;
  /** Maximum time to wait for SQL Server readiness. */
  readonly startupTimeoutMs?: number;
}

/** Testcontainers-backed SQL Server implementation of the container contract. */
export class SqlServerTestContainer implements TestContainer<SqlServerResource> {
  readonly kind = Container.SqlServer;

  private started: StartedMSSQLServerContainer | undefined;
  private resource: SqlServerResource | undefined;
  private startPromise: Promise<SqlServerResource> | undefined;
  private stopped = false;

  /** Creates an unstarted SQL Server adapter. */
  constructor(private readonly options: SqlServerTestContainerOptions = {}) {}

  /**
   * Starts SQL Server once, attaches it to the supplied network, and returns the host
   * connection information discovered from Testcontainers.
   */
  start(options: ContainerStartOptions = {}): Promise<SqlServerResource> {
    if (this.stopped) {
      return Promise.reject(new Error('SQL Server container has already been stopped'));
    }
    this.startPromise ??= this.startOnce(options);
    return this.startPromise;
  }

  /** Stops the Testcontainers handle when startup completed successfully. */
  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;

    try {
      await this.startPromise;
    } catch {
      return;
    }

    const started = this.started;
    this.started = undefined;
    this.resource = undefined;
    if (started !== undefined) {
      await started.stop();
    }
  }

  private async startOnce(options: ContainerStartOptions): Promise<SqlServerResource> {
    const image = this.options.image ?? DEFAULT_IMAGE;
    const password = this.options.password ?? DEFAULT_PASSWORD;
    const startupTimeoutMs = this.options.startupTimeoutMs ?? 180_000;

    let container = new MSSQLServerContainer(image)
      .acceptLicense()
      .withPassword(password)
      .withStartupTimeout(startupTimeoutMs);
    options.logger?.info(
      `container:${this.kind}`,
      `preparing image ${image}`,
    );
    if (options.containerLogs === true && options.logger !== undefined) {
      container = container.withLogConsumer(
        createContainerLogConsumer(this.kind, options.logger),
      );
    }
    if (this.options.platform !== undefined) {
      container = container.withPlatform(this.options.platform);
    }
    if (options.network !== undefined) {
      container = container.withNetwork(options.network.native as StartedNetwork);
    }
    if (options.networkAliases !== undefined && options.networkAliases.length > 0) {
      container = container.withNetworkAliases(...options.networkAliases);
    }

    try {
      const started = await container.start();
      this.started = started;
      this.resource = {
        kind: Container.SqlServer,
        host: started.getHost(),
        port: started.getPort(),
        username: started.getUsername(),
        password: started.getPassword(),
        database: started.getDatabase(),
      };
      options.logger?.info(
        `container:${this.kind}`,
        `accepting connections on ${this.resource.host}:${this.resource.port}`,
      );
      return this.resource;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }
}
