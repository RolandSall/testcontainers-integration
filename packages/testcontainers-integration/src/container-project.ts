import { Container } from './container-kind.js';
import type { Container as ManagedContainer } from './container-kind.js';
import type { ContainerResource } from './container-contract.js';
import { parseContainerIsolation, type ContainerIsolation } from './container-isolation.js';
import type { ContainerKind, ContainerResourceMap } from './container-resource-map.js';
import { ContainerRegistry } from './container-registry.js';
import type { ContainerRuntimeInstance } from './container-runtime.js';
import type { MongoDbTestContainerOptions } from './mongo-db/mongo-db-container.js';
import { MongoDbTestContainer } from './mongo-db/mongo-db-container.js';
import type { PostgreSqlTestContainerOptions } from './postgresql/postgresql-container.js';
import { PostgreSqlTestContainer } from './postgresql/postgresql-container.js';
import type { RabbitMqTestContainerOptions } from './rabbit-mq/rabbit-mq-container.js';
import { RabbitMqTestContainer } from './rabbit-mq/rabbit-mq-container.js';
import type { SqlServerTestContainerOptions } from './sql-server/sql-server-container.js';
import { SqlServerTestContainer } from './sql-server/sql-server-container.js';

/** Serializable built-in container declaration accepted by runner project configuration. */
export type BuiltInContainerDefinition =
  | Readonly<{ kind: typeof Container.MongoDb; isolation: ContainerIsolation; options: MongoDbTestContainerOptions }>
  | Readonly<{ kind: typeof Container.PostgreSql; isolation: ContainerIsolation; options: PostgreSqlTestContainerOptions }>
  | Readonly<{ kind: typeof Container.RabbitMq; isolation: ContainerIsolation; options: RabbitMqTestContainerOptions }>
  | Readonly<{ kind: typeof Container.SqlServer; isolation: ContainerIsolation; options: SqlServerTestContainerOptions }>;

/** Named container declarations used by an explicit runner project. */
export type ContainerProjectContainers = Readonly<Record<string, BuiltInContainerDefinition>>;

type EnvironmentProperty<TKind extends ContainerKind> = Extract<{
  [TProperty in keyof ContainerResourceMap[TKind]]-?:
    ContainerResourceMap[TKind][TProperty] extends string | number ? TProperty : never;
}[keyof ContainerResourceMap[TKind]], string>;

/** Serializable reference to one property of one named started container. */
export interface ContainerEnvironmentReference<
  TName extends string = string,
  TProperty extends string = string,
> {
  readonly source: 'container';
  readonly container: TName;
  readonly property: TProperty;
}

type ContainerEnvironmentReferenceFor<
  TContainers extends ContainerProjectContainers,
> = {
  [TName in Extract<keyof TContainers, string>]: ContainerEnvironmentReference<
    TName,
    EnvironmentProperty<TContainers[TName]['kind']>
  >;
}[Extract<keyof TContainers, string>];

/** Environment variables populated from the named containers in a project. */
export type ContainerProjectEnvironment<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> = Readonly<Record<string, ContainerEnvironmentReferenceFor<TContainers>>>;

/** Application setup module plus optional declarative environment bindings. */
export interface ContainerProjectApplication<
  TContainers extends ContainerProjectContainers = ContainerProjectContainers,
> {
  readonly setup: string;
  readonly environment?: ContainerProjectEnvironment<TContainers>;
}

/** Creates a serializable named-container property reference. */
export const fromContainer = <const TName extends string, const TProperty extends string>(
  container: TName,
  property: TProperty,
): ContainerEnvironmentReference<TName, TProperty> => ({
  source: 'container',
  container,
  property,
});

export interface SerializedContainerProject {
  readonly version: 2;
  readonly containers: readonly Readonly<{
    name: string;
    kind: ContainerKind;
    isolation: ContainerIsolation;
    options: Readonly<Record<string, string | number>>;
  }>[];
  readonly environment?: Readonly<Record<string, ContainerEnvironmentReference>>;
  readonly containerLogs?: boolean;
}

/** Declares a PostgreSQL container for explicit project configuration. */
export const postgreSql = (
  declaration: PostgreSqlTestContainerOptions & Readonly<{ isolation: ContainerIsolation }>,
): Readonly<{
  kind: typeof Container.PostgreSql;
  isolation: ContainerIsolation;
  options: PostgreSqlTestContainerOptions;
}> => {
  const { isolation, ...options } = declaration;
  return { kind: Container.PostgreSql, isolation, options };
};

/** Declares a RabbitMQ container for explicit project configuration. */
export const rabbitMq = (
  declaration: RabbitMqTestContainerOptions & Readonly<{ isolation: ContainerIsolation }>,
): Readonly<{
  kind: typeof Container.RabbitMq;
  isolation: ContainerIsolation;
  options: RabbitMqTestContainerOptions;
}> => {
  const { isolation, ...options } = declaration;
  return { kind: Container.RabbitMq, isolation, options };
};

/** Declares a MongoDB container for explicit project configuration. */
export const mongoDb = (
  declaration: MongoDbTestContainerOptions & Readonly<{ isolation: ContainerIsolation }>,
): Readonly<{
  kind: typeof Container.MongoDb;
  isolation: ContainerIsolation;
  options: MongoDbTestContainerOptions;
}> => {
  const { isolation, ...options } = declaration;
  return { kind: Container.MongoDb, isolation, options };
};

/** Declares a SQL Server container for explicit project configuration. */
export const sqlServer = (
  declaration: SqlServerTestContainerOptions & Readonly<{ isolation: ContainerIsolation }>,
): Readonly<{
  kind: typeof Container.SqlServer;
  isolation: ContainerIsolation;
  options: SqlServerTestContainerOptions;
}> => {
  const { isolation, ...options } = declaration;
  return { kind: Container.SqlServer, isolation, options };
};

export const serializeContainerProject = <
  TContainers extends ContainerProjectContainers,
>(
  containers: TContainers,
  environment?: ContainerProjectEnvironment<TContainers>,
  containerLogs?: boolean,
): SerializedContainerProject => {
  const definitions = Object.entries(containers).map(([name, definition]) => ({
    name,
    kind: definition.kind,
    isolation: definition.isolation,
    options: definition.options,
  }));
  return parseContainerProject({
    version: 2,
    containers: definitions,
    environment,
    containerLogs,
  });
};

export const parseContainerProject = (value: unknown): SerializedContainerProject => {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.containers)) {
    throw new Error('Container project configuration is missing, invalid, or uses an unsupported version');
  }

  const names = new Set<string>();
  const containers = value.containers.map((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.name !== 'string' ||
      candidate.name.length === 0 ||
      !isContainerKind(candidate.kind) ||
      !isPrimitiveRecord(candidate.options)
    ) {
      throw new Error('Container project contains an invalid container declaration');
    }
    let isolation: ContainerIsolation;
    try {
      isolation = parseContainerIsolation(candidate.isolation);
    } catch (error) {
      throw new Error(`Container project isolation is invalid: ${candidate.name}`, { cause: error });
    }
    if (names.has(candidate.name)) {
      throw new Error(`Container project name is duplicated: ${candidate.name}`);
    }
    names.add(candidate.name);
    return {
      name: candidate.name,
      kind: candidate.kind,
      isolation,
      options: candidate.options,
    };
  });
  const environment = parseContainerEnvironment(value.environment, containers);
  if (value.containerLogs !== undefined && typeof value.containerLogs !== 'boolean') {
    throw new Error('Container project containerLogs option is invalid');
  }
  return {
    version: 2,
    containers,
    ...(environment === undefined ? {} : { environment }),
    ...(value.containerLogs === undefined ? {} : { containerLogs: value.containerLogs }),
  };
};

export const createContainerProjectRegistry = (
  project: SerializedContainerProject,
): ContainerRegistry => {
  const registry = new ContainerRegistry();
  const kindCounts = new Map<ContainerKind, number>();
  for (const { kind } of project.containers) {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  for (const definition of project.containers) {
    const create = containerFactory(definition);
    registry.registerInstance(
      definition.name,
      definition.kind,
      create,
      kindCounts.get(definition.kind) === 1,
    );
  }
  return registry;
};

const containerFactory = (
  definition: SerializedContainerProject['containers'][number],
): (() => ManagedContainer<ContainerResource>) => {
    switch (definition.kind) {
      case Container.MongoDb:
        return () => new MongoDbTestContainer(definition.options);
      case Container.PostgreSql:
        return () => new PostgreSqlTestContainer(definition.options);
      case Container.RabbitMq:
        return () => new RabbitMqTestContainer(definition.options);
      case Container.SqlServer:
        return () => new SqlServerTestContainer(definition.options);
    }
    throw new Error(`Unsupported container kind: ${definition.kind}`);
};

export const containerProjectKinds = (
  project: SerializedContainerProject,
): readonly ContainerKind[] => project.containers.map(({ kind }) => kind);

export const containerProjectInstances = (
  project: SerializedContainerProject,
  isolation?: ContainerIsolation,
): readonly ContainerRuntimeInstance[] => project.containers
  .filter((container) => isolation === undefined || container.isolation === isolation)
  .map(({ name, kind }) => ({
    name,
    kind,
  }));

const parseContainerEnvironment = (
  value: unknown,
  containers: SerializedContainerProject['containers'],
): Readonly<Record<string, ContainerEnvironmentReference>> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error('Container project environment is invalid');
  }
  const declarations = new Map(containers.map((container) => [container.name, container]));
  const environment: Record<string, ContainerEnvironmentReference> = {};
  for (const [variable, candidate] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
      throw new Error(`Container project environment variable is invalid: ${variable}`);
    }
    if (
      !isRecord(candidate) ||
      candidate.source !== 'container' ||
      typeof candidate.container !== 'string' ||
      typeof candidate.property !== 'string' ||
      candidate.property.length === 0
    ) {
      throw new Error(`Container project environment binding is invalid: ${variable}`);
    }
    if (!declarations.has(candidate.container)) {
      throw new Error(
        `Container project environment references an unknown container: ${candidate.container}`,
      );
    }
    environment[variable] = {
      source: 'container',
      container: candidate.container,
      property: candidate.property,
    };
  }
  return environment;
};

const isContainerKind = (value: unknown): value is ContainerKind =>
  Object.values(Container).some((kind) => kind === value);

const isPrimitiveRecord = (
  value: unknown,
): value is Readonly<Record<string, string | number>> =>
  isRecord(value) &&
  Object.values(value).every(
    (entry) => typeof entry === 'string' || typeof entry === 'number',
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
