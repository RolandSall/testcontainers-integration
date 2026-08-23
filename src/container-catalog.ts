import { Container } from './container-kind.js';
import type { ContainerKind } from './container-resource-map.js';

/** Property-name catalog accepted by static runner requirement discovery. */
export type ContainerCatalog = Readonly<Record<string, ContainerKind>>;

/**
 * Extends the built-in `Container` catalog with typed consumer-defined container kinds.
 *
 * Import the returned catalog as `Container` in annotated test files and pass the same
 * object as `containerNames` to runner global setup.
 */
export const defineContainerCatalog = <
  const TCustom extends Readonly<Record<string, ContainerKind>>,
>(custom: TCustom): Readonly<typeof Container & TCustom> => {
  for (const name of Object.keys(custom)) {
    if (name in Container) {
      throw new Error(`Container catalog name is already built in: ${name}`);
    }
  }
  return Object.freeze({ ...Container, ...custom });
};
