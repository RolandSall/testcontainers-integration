import type { IntegrationEnvironmentContext } from './integration-environment-context.js';
import type { IntegrationEnvironmentOptions } from './integration-environment-options.js';
import { consoleIntegrationTestLogger } from '../logging/console-integration-test-logger.js';
import type { IntegrationTestLogger } from '../logging/integration-test-logger.js';

/**
 * Coordinates container and application lifecycle without depending on a test runner.
 *
 * Startup order is containers then application. Shutdown order is application then
 * containers. Repeated calls reuse the same start and stop promises.
 */
export class IntegrationEnvironment<TApplication> {
  private context: IntegrationEnvironmentContext<TApplication> | undefined;
  private startPromise: Promise<IntegrationEnvironmentContext<TApplication>> | undefined;
  private stopPromise: Promise<void> | undefined;
  private readonly logger: IntegrationTestLogger;

  /** Creates an environment from explicit lifecycle dependencies. */
  constructor(private readonly options: IntegrationEnvironmentOptions<TApplication>) {
    this.logger = options.logger ?? consoleIntegrationTestLogger;
  }

  /** Starts required containers, then starts the application with their resources. */
  start(): Promise<IntegrationEnvironmentContext<TApplication>> {
    if (this.stopPromise !== undefined) {
      return Promise.reject(new Error('Integration environment has already been stopped'));
    }
    this.startPromise ??= this.startOnce();
    return this.startPromise;
  }

  /**
   * Returns the active application and resources.
   *
   * @throws When the environment has not completed startup.
   */
  current(): IntegrationEnvironmentContext<TApplication> {
    if (this.context === undefined) {
      throw new Error('Integration environment has not started');
    }
    return this.context;
  }

  /** Stops the application, then releases the source of container resources. */
  stop(): Promise<void> {
    this.stopPromise ??= this.stopOnce();
    return this.stopPromise;
  }

  private async startOnce(): Promise<IntegrationEnvironmentContext<TApplication>> {
    try {
      const resources = await this.options.containers.start(
        this.options.requiredContainers,
      );
      if (this.options.prepareResources !== undefined) {
        this.logger.info('application', 'preparing container resources');
        await this.options.prepareResources(resources);
        this.logger.info('application', 'container resources are ready');
      }
      this.logger.info('application', 'starting application');
      const application = await this.options.application.start(resources);
      this.logger.info('application', 'application is ready');
      this.context = { resources, application };
      return this.context;
    } catch (error) {
      this.logger.error('application', 'integration environment failed to start', error);
      await this.options.containers.stop();
      throw error;
    }
  }

  private async stopOnce(): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.startPromise;
    } catch {
      return;
    }

    const activeContext = this.context;
    this.context = undefined;
    if (activeContext !== undefined) {
      try {
        this.logger.info('application', 'stopping application');
        await this.options.application.stop(activeContext.application);
        this.logger.info('application', 'application stopped');
      } catch (error) {
        this.logger.error('application', 'application failed to stop', error);
        failures.push(error);
      }
    }
    try {
      await this.options.containers.stop();
    } catch (error) {
      failures.push(error);
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, 'Integration environment cleanup failed');
    }
  }
}
