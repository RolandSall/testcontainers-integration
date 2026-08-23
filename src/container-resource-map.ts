import type { Container } from './container-kind.js';
import type { SqlServerResource } from './sql-server/sql-server-resource.js';

/** Consumers may augment this interface when they publish another container adapter. */
export interface ContainerResourceMap {
  readonly [Container.SqlServer]: SqlServerResource;
}

export type ContainerKind = keyof ContainerResourceMap;
