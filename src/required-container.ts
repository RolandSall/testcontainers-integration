import type { ContainerKind } from './container-resource-map.js';

/** Constructor shape accepted by integration-test marker decorators. */
export type IntegrationTestClass = abstract new (...arguments_: never[]) => unknown;

const requirements = new WeakMap<IntegrationTestClass, readonly ContainerKind[]>();

/**
 * Declares one or more container kinds required by an integration-test class.
 *
 * The Vitest scanner reads the literal decorator before test modules load. When the module
 * later loads, the decorator also stores runtime metadata for test helpers.
 */
export const RequiredContainer = (
  ...kinds: [ContainerKind, ...ContainerKind[]]
): (<TClass extends IntegrationTestClass>(target: TClass) => TClass) => {
  const uniqueKinds = [...new Set(kinds)];
  return (target) => {
    requirements.set(target, uniqueKinds);
    return target;
  };
};

/** Returns the unique container kinds stored for a decorated test marker. */
export const requiredContainersFor = (
  target: IntegrationTestClass,
): readonly ContainerKind[] =>
  requirements.get(target) ?? [];
