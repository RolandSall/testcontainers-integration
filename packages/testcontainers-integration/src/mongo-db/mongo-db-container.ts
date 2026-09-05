import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import type { StartedNetwork } from 'testcontainers';
import { Container, type Container as TestContainer } from '../container-kind.js';
import type { ContainerStartOptions } from '../container-start-options.js';
import { createContainerLogConsumer } from '../logging/container-log-consumer.js';
import type { MongoDbResource } from './mongo-db-resource.js';

const DEFAULT_IMAGE = 'mongo:7.0.40';

/** Configuration for the built-in MongoDB adapter. */
export interface MongoDbTestContainerOptions {
  readonly image?: string;
  readonly username?: string;
  readonly password?: string;
  readonly startupTimeoutMs?: number;
}

/** Testcontainers-backed MongoDB adapter. */
export class MongoDbTestContainer implements TestContainer<MongoDbResource> {
  readonly kind = Container.MongoDb;
  private started: StartedMongoDBContainer | undefined;
  private startPromise: Promise<MongoDbResource> | undefined;
  private stopped = false;

  constructor(private readonly options: MongoDbTestContainerOptions = {}) {}

  start(options: ContainerStartOptions = {}): Promise<MongoDbResource> {
    if (this.stopped) return Promise.reject(new Error('MongoDB container has already been stopped'));
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

  private async startOnce(options: ContainerStartOptions): Promise<MongoDbResource> {
    const image = this.options.image ?? DEFAULT_IMAGE;
    let container = new MongoDBContainer(image).withStartupTimeout(this.options.startupTimeoutMs ?? 120_000);
    if (this.options.username !== undefined) container = container.withUsername(this.options.username);
    if (this.options.password !== undefined) container = container.withPassword(this.options.password);
    if (options.logger !== undefined) container = container.withLogConsumer(createContainerLogConsumer(this.kind, options.logger));
    if (options.network !== undefined) container = container.withNetwork(options.network.native as StartedNetwork);
    if (options.networkAliases !== undefined) container = container.withNetworkAliases(...options.networkAliases);
    options.logger?.info(`container:${this.kind}`, `preparing image ${image}`);
    try {
      const started = await container.start();
      this.started = started;
      const resource: MongoDbResource = {
        kind: this.kind,
        host: started.getHost(),
        port: started.getMappedPort(27017),
        connectionString: started.getConnectionString(),
      };
      options.logger?.info(`container:${this.kind}`, `accepting connections on ${resource.host}:${resource.port}`);
      return resource;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }
}
