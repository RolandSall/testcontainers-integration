import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import type { StartedNetwork } from 'testcontainers';
import { Container, type Container as TestContainer } from '../container-kind.js';
import type { ContainerStartOptions } from '../container-start-options.js';
import { createContainerLogConsumer } from '../logging/container-log-consumer.js';
import type { RabbitMqResource } from './rabbit-mq-resource.js';

const DEFAULT_IMAGE = 'rabbitmq:4.1.8-management-alpine';

/** Configuration for the built-in RabbitMQ adapter. */
export interface RabbitMqTestContainerOptions {
  readonly image?: string;
  readonly startupTimeoutMs?: number;
}

/** Testcontainers-backed RabbitMQ adapter. */
export class RabbitMqTestContainer implements TestContainer<RabbitMqResource> {
  readonly kind = Container.RabbitMq;
  private started: StartedRabbitMQContainer | undefined;
  private startPromise: Promise<RabbitMqResource> | undefined;
  private stopped = false;

  constructor(private readonly options: RabbitMqTestContainerOptions = {}) {}

  start(options: ContainerStartOptions = {}): Promise<RabbitMqResource> {
    if (this.stopped) return Promise.reject(new Error('RabbitMQ container has already been stopped'));
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

  private async startOnce(options: ContainerStartOptions): Promise<RabbitMqResource> {
    const image = this.options.image ?? DEFAULT_IMAGE;
    let container = new RabbitMQContainer(image).withStartupTimeout(this.options.startupTimeoutMs ?? 120_000);
    if (options.logger !== undefined) container = container.withLogConsumer(createContainerLogConsumer(this.kind, options.logger));
    if (options.network !== undefined) container = container.withNetwork(options.network.native as StartedNetwork);
    if (options.networkAliases !== undefined) container = container.withNetworkAliases(...options.networkAliases);
    options.logger?.info(`container:${this.kind}`, `preparing image ${image}`);
    try {
      const started = await container.start();
      this.started = started;
      const resource: RabbitMqResource = {
        kind: this.kind,
        host: started.getHost(),
        port: started.getMappedPort(5672),
        amqpUrl: started.getAmqpUrl(),
        amqpsUrl: started.getAmqpsUrl(),
      };
      options.logger?.info(`container:${this.kind}`, `accepting connections on ${resource.host}:${resource.port}`);
      return resource;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }
}
