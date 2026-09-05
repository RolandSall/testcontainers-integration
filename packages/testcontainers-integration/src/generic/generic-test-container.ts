import { GenericContainer, type StartedNetwork, type StartedTestContainer } from 'testcontainers';
import type { ContainerResource } from '../container-contract.js';
import type { Container as TestContainer } from '../container-kind.js';
import type { ContainerStartOptions } from '../container-start-options.js';
import { createContainerLogConsumer } from '../logging/container-log-consumer.js';
import type {
  GenericContainerConnection,
  GenericContainerResource,
} from './generic-container-resource.js';

/** Declarative configuration for an application-specific Docker image. */
export interface GenericTestContainerOptions<
  TKind extends string,
  TResource extends ContainerResource & { readonly kind: TKind },
> {
  readonly kind: TKind;
  readonly image: string;
  readonly exposedPorts?: readonly number[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly command?: readonly string[];
  readonly startupTimeoutMs?: number;
  readonly configure?: (container: GenericContainer) => GenericContainer;
  readonly resource: (
    connection: GenericContainerConnection,
    started: StartedTestContainer,
  ) => TResource;
}

/**
 * Adapter for images that do not need a dedicated first-party Testcontainers module.
 * Consumers register its kind in `ContainerResourceMap` to retain typed lookup.
 */
export class GenericTestContainer<
  TKind extends string,
  TResource extends ContainerResource & { readonly kind: TKind } = GenericContainerResource<TKind>,
> implements TestContainer<TResource> {
  readonly kind: TKind;
  private started: StartedTestContainer | undefined;
  private startPromise: Promise<TResource> | undefined;
  private stopped = false;

  constructor(private readonly options: GenericTestContainerOptions<TKind, TResource>) {
    this.kind = options.kind;
  }

  start(options: ContainerStartOptions = {}): Promise<TResource> {
    if (this.stopped) return Promise.reject(new Error(`${this.kind} container has already been stopped`));
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

  private async startOnce(options: ContainerStartOptions): Promise<TResource> {
    let container = new GenericContainer(this.options.image).withStartupTimeout(
      this.options.startupTimeoutMs ?? 120_000,
    );
    const ports = this.options.exposedPorts ?? [];
    if (ports.length > 0) container = container.withExposedPorts(...ports);
    if (this.options.environment !== undefined) container = container.withEnvironment(this.options.environment);
    if (this.options.command !== undefined) container = container.withCommand([...this.options.command]);
    if (options.logger !== undefined) container = container.withLogConsumer(createContainerLogConsumer(this.kind, options.logger));
    if (options.network !== undefined) container = container.withNetwork(options.network.native as StartedNetwork);
    if (options.networkAliases !== undefined) container = container.withNetworkAliases(...options.networkAliases);
    if (this.options.configure !== undefined) container = this.options.configure(container);
    options.logger?.info(`container:${this.kind}`, `preparing image ${this.options.image}`);
    try {
      const started = await container.start();
      this.started = started;
      const connection: GenericContainerConnection = {
        host: started.getHost(),
        mappedPorts: Object.fromEntries(ports.map((port) => [port, started.getMappedPort(port)])),
      };
      const resource = this.options.resource(connection, started);
      options.logger?.info(`container:${this.kind}`, 'container is accepting connections');
      return resource;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }
}
