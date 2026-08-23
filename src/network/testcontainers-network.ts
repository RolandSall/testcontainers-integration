import type { StartedNetwork } from 'testcontainers';
import type { ContainerNetwork } from './container-network.js';

class TestcontainersNetwork implements ContainerNetwork {
  constructor(readonly native: StartedNetwork) {}

  async stop(): Promise<void> {
    await this.native.stop();
  }
}

interface TestcontainersModule {
  readonly Network: new () => { start(): Promise<StartedNetwork> };
}

const isTestcontainersModule = (value: unknown): value is TestcontainersModule =>
  typeof value === 'object' &&
  value !== null &&
  'Network' in value &&
  typeof value.Network === 'function';

/** Starts a Testcontainers network and hides its native handle behind `ContainerNetwork`. */
export const startTestcontainersNetwork = async (): Promise<ContainerNetwork> => {
  const packageName = 'testcontainers';
  const testcontainers: unknown = await import(packageName);
  if (!isTestcontainersModule(testcontainers)) {
    throw new Error('The testcontainers package does not export Network');
  }
  return new TestcontainersNetwork(await new testcontainers.Network().start());
};
