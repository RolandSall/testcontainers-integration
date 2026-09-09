import type {
  ContainerEnvironmentReference,
  SerializedContainerProject,
} from './container-project.js';
import type { ContainerResources } from './container-resources.js';
import type { ContainerKind } from './container-resource-map.js';

/** Resolves declared environment bindings without exposing or logging their values. */
export const resolveContainerProjectEnvironment = (
  project: SerializedContainerProject,
  resources: ContainerResources,
): Readonly<Record<string, string>> => resolveContainerEnvironment(
  project.containers,
  project.environment,
  resources,
);

/** Resolves bindings against one file's named declarations and selected resources. */
export const resolveContainerEnvironment = (
  declarations: readonly Readonly<{ name: string; kind: ContainerKind }>[],
  environment: Readonly<Record<string, ContainerEnvironmentReference>> | undefined,
  resources: ContainerResources,
): Readonly<Record<string, string>> => {
  const containers = new Map(declarations.map((container) => [container.name, container] as const));
  return Object.fromEntries(
    Object.entries(environment ?? {}).map(([variable, reference]) => {
      const declaration = containers.get(reference.container);
      if (declaration === undefined) {
        throw new Error(
          `Environment variable ${variable} references an unknown container: ${reference.container}`,
        );
      }
      const resource = resources.getNamed(reference.container, declaration.kind);
      const value: unknown = Reflect.get(resource, reference.property);
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(
          `Environment variable ${variable} references a non-scalar resource property: ${reference.container}.${reference.property}`,
        );
      }
      return [variable, String(value)] as const;
    }),
  );
};

/** Installs values for a test run and returns an idempotent restoration callback. */
export const installProcessEnvironment = (
  environment: Readonly<Record<string, string>>,
): (() => void) => {
  const previous = new Map(
    Object.keys(environment).map((variable) => [variable, process.env[variable]] as const),
  );
  for (const [variable, value] of Object.entries(environment)) {
    process.env[variable] = value;
  }
  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    for (const [variable, value] of previous) {
      if (value === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = value;
      }
    }
  };
};
