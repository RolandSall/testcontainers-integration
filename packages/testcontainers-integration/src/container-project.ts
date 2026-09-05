import { Container } from './container-kind.js';
import type { Container as ManagedContainer } from './container-kind.js';
import type { ContainerResource } from './container-contract.js';
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
  | Readonly<{ kind: typeof Container.MongoDb; options: MongoDbTestContainerOptions }>
  | Readonly<{ kind: typeof Container.PostgreSql; options: PostgreSqlTestContainerOptions }>
  | Readonly<{ kind: typeof Container.RabbitMq; options: RabbitMqTestContainerOptions }>
  | Readonly<{ kind: typeof Container.SqlServer; options: SqlServerTestContainerOptions }>;

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
  readonly version: 1;
  readonly containers: readonly Readonly<{
    name: string;
    kind: ContainerKind;
    options: Readonly<Record<string, string | number>>;
  }>[];
  readonly environment?: Readonly<Record<string, ContainerEnvironmentReference>>;
}

/** Declares a PostgreSQL container for explicit project configuration. */
export const postgreSql = (
  options: PostgreSqlTestContainerOptions = {},
): Readonly<{
  kind: typeof Container.PostgreSql;
  options: PostgreSqlTestContainerOptions;
}> => ({ kind: Container.PostgreSql, options });

/** Declares a RabbitMQ container for explicit project configuration. */
export const rabbitMq = (
  options: RabbitMqTestContainerOptions = {},
): Readonly<{
  kind: typeof Container.RabbitMq;
  options: RabbitMqTestContainerOptions;
}> => ({ kind: Container.RabbitMq, options });

/** Declares a MongoDB container for explicit project configuration. */
export const mongoDb = (
  options: MongoDbTestContainerOptions = {},
): Readonly<{
  kind: typeof Container.MongoDb;
  options: MongoDbTestContainerOptions;
}> => ({ kind: Container.MongoDb, options });

/** Declares a SQL Server container for explicit project configuration. */
export const sqlServer = (
  options: SqlServerTestContainerOptions = {},
): Readonly<{
  kind: typeof Container.SqlServer;
  options: SqlServerTestContainerOptions;
}> => ({ kind: Container.SqlServer, options });

export const serializeContainerProject = <
  TContainers extends ContainerProjectContainers,
>(
  containers: TContainers,
  environment?: ContainerProjectEnvironment<TContainers>,
): SerializedContainerProject => {
  const definitions = Object.entries(containers).map(([name, definition]) => ({
    name,
    kind: definition.kind,
    options: definition.options,
  }));
  return parseContainerProject({ version: 1, containers: definitions, environment });
};

export const parseContainerProject = (value: unknown): SerializedContainerProject => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.containers)) {
    throw new Error('Container project configuration is missing or invalid');
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
    if (names.has(candidate.name)) {
      throw new Error(`Container project name is duplicated: ${candidate.name}`);
    }
    names.add(candidate.name);
    return {
      name: candidate.name,
      kind: candidate.kind,
      options: candidate.options,
    };
  });
  const environment = parseContainerEnvironment(value.environment, containers);
  return {
    version: 1,
    containers,
    ...(environment === undefined ? {} : { environment }),
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
): readonly ContainerRuntimeInstance[] => project.containers.map(({ name, kind }) => ({
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
