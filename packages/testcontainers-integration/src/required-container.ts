import type { ContainerKind } from './container-resource-map.js';

/** Constructor shape accepted by integration-test marker decorators. */
export type IntegrationTestClass = abstract new (...arguments_: never[]) => unknown;

const requirements = new WeakMap<IntegrationTestClass, readonly ContainerKind[]>();

type RequiredContainerDecorator = <TClass extends IntegrationTestClass>(target: TClass) => TClass;

/**
 * Declares one or more container kinds required by an integration-test class.
 *
 * The Vitest scanner reads the literal decorator before test modules load. When the module
 * later loads, the decorator also stores runtime metadata for test helpers.
 */
export const RequiredContainer = (
  kindsOrFirst: ContainerKind | readonly [ContainerKind, ...ContainerKind[]],
  ...additionalKinds: ContainerKind[]
): RequiredContainerDecorator => {
  const usesList = isContainerKindList(kindsOrFirst);
  if (usesList && additionalKinds.length > 0) {
    throw new Error('RequiredContainer accepts either a container list or individual arguments');
  }
  const kinds: readonly ContainerKind[] = usesList
    ? kindsOrFirst
    : [kindsOrFirst, ...additionalKinds];
  const uniqueKinds = [...new Set(kinds)];
  return (target) => {
    requirements.set(target, [
      ...new Set([...(requirements.get(target) ?? []), ...uniqueKinds]),
    ]);
    return target;
  };
};

const isContainerKindList = (
  value: ContainerKind | readonly [ContainerKind, ...ContainerKind[]],
): value is readonly [ContainerKind, ...ContainerKind[]] => Array.isArray(value);

/** Returns the unique container kinds stored for a decorated test marker. */
export const requiredContainersFor = (
  target: IntegrationTestClass,
): readonly ContainerKind[] =>
  requirements.get(target) ?? [];
