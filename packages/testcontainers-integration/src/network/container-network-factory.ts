import type { ContainerNetwork } from './container-network.js';

/** Creates and starts the shared network used by a container runtime. */
export type ContainerNetworkFactory = () => Promise<ContainerNetwork>;
