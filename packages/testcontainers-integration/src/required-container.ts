import type { ContainerIsolation } from './container-isolation.js';
import type { ContainerKind } from './container-resource-map.js';
import type { ContainerRuntimeInstance } from './container-runtime.js';

/** Constructor shape accepted by integration-test marker decorators. */
export type IntegrationTestClass = abstract new (...arguments_: never[]) => unknown;

/** One named container declaration attached to an integration-test file. */
export interface RequiredContainerDefinition {
  readonly kind: ContainerKind;
  readonly isolation: ContainerIsolation;
}

/** Named container declarations attached to one integration-test marker class. */
export type RequiredContainerDefinitions = Readonly<Record<string, RequiredContainerDefinition>>;

/** Runtime form used to start or select one named container. */
export interface RequiredContainerInstance extends ContainerRuntimeInstance {
  readonly isolation: ContainerIsolation;
}

const requirements = new WeakMap<IntegrationTestClass, readonly RequiredContainerInstance[]>();
const pendingRequiredContainerClasses = new Set<IntegrationTestClass>();

type RequiredContainerDecorator = <TClass extends IntegrationTestClass>(target: TClass) => TClass;

/** Declares named shared or file-dedicated containers required by one integration-test file. */
export const RequiredContainer = (
  definitions: RequiredContainerDefinitions,
): RequiredContainerDecorator => {
  const instances = parseRuntimeDefinitions(definitions);
  return (target) => {
    requirements.set(target, instances);
    pendingRequiredContainerClasses.add(target);
    return target;
  };
};

/** Returns the named container requirements stored for a decorated marker class. */
export const requiredContainersFor = (
  target: IntegrationTestClass,
): readonly RequiredContainerInstance[] => requirements.get(target) ?? [];

/** Consumes the one required-container marker declared by the current test file. */
export const consumeRequiredContainerClass = (): IntegrationTestClass | undefined => {
  const classes = [...pendingRequiredContainerClasses];
  pendingRequiredContainerClasses.clear();
  if (classes.length > 1) {
    throw new Error(`Expected one @RequiredContainer class in the test file, found ${classes.length}`);
  }
  return classes[0];
};

const parseRuntimeDefinitions = (
  definitions: RequiredContainerDefinitions,
): readonly RequiredContainerInstance[] => {
  const candidate: unknown = definitions;
  if (!isRecord(candidate)) {
    throw new Error('@RequiredContainer requires a named container object');
  }
  const entries = Object.entries(candidate);
  if (entries.length === 0) {
    throw new Error('@RequiredContainer needs at least one named container');
  }
  return entries.map(([name, definition]) => {
    if (name.length === 0) {
      throw new Error('@RequiredContainer container names must not be empty');
    }
    if (
      !isRecord(definition) ||
      typeof definition.kind !== 'string' ||
      (definition.isolation !== 'shared' && definition.isolation !== 'dedicated')
    ) {
      throw new Error(`@RequiredContainer declaration is invalid: ${name}`);
    }
    return {
      name,
      kind: definition.kind as ContainerKind,
      isolation: definition.isolation,
    };
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
