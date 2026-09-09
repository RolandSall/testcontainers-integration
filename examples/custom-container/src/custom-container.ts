import {
  GenericTestContainer,
  RequiredContainer,
  createDefaultContainerRegistry,
  defineContainerCatalog,
} from '@integration-testing/testcontainers';

interface RedisPrimaryResource {
  readonly kind: 'redis-primary';
  readonly host: string;
  readonly port: number;
}

interface RedisReplicaResource {
  readonly kind: 'redis-replica';
  readonly host: string;
  readonly port: number;
}

declare module '@integration-testing/testcontainers/container-resource-map' {
  interface ContainerResourceMap {
    readonly 'redis-primary': RedisPrimaryResource;
    readonly 'redis-replica': RedisReplicaResource;
  }
}

export const containerCatalog = defineContainerCatalog({
  RedisPrimary: 'redis-primary',
  RedisReplica: 'redis-replica',
});

const mappedPort = (ports: Readonly<Record<number, number>>, port: number): number => {
  const mapped = ports[port];
  if (mapped === undefined) throw new Error(`Missing mapped port ${port}`);
  return mapped;
};

const redisPrimary = () =>
  new GenericTestContainer<'redis-primary', RedisPrimaryResource>({
    kind: containerCatalog.RedisPrimary,
    image: 'redis:7-alpine',
    exposedPorts: [6379],
    resource: (connection) => ({
      kind: containerCatalog.RedisPrimary,
      host: connection.host,
      port: mappedPort(connection.mappedPorts, 6379),
    }),
  });

const redisReplica = () =>
  new GenericTestContainer<'redis-replica', RedisReplicaResource>({
    kind: containerCatalog.RedisReplica,
    image: 'redis:7-alpine',
    exposedPorts: [6379],
    command: ['redis-server', '--replicaof', 'redis-primary', '6379'],
    resource: (connection) => ({
      kind: containerCatalog.RedisReplica,
      host: connection.host,
      port: mappedPort(connection.mappedPorts, 6379),
    }),
  });

export const registry = createDefaultContainerRegistry()
  .register(containerCatalog.RedisPrimary, redisPrimary)
  .register(containerCatalog.RedisReplica, redisReplica);

const Container = containerCatalog;

@RequiredContainer({
  'redis-primary': { kind: Container.RedisPrimary, isolation: 'shared' },
  'redis-replica': { kind: Container.RedisReplica, isolation: 'shared' },
})
export class RedisReplicationIntegrationTest {}
