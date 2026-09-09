import type { ContainerEnvironmentReference } from './container-project.js';

/** Application setup module and declarative bindings used by annotation projects. */
export interface AnnotationProjectApplication {
  readonly setup: string;
  readonly environment?: Readonly<Record<string, ContainerEnvironmentReference>>;
}

/** Serializable annotation-discovery options transported through runner configuration. */
export interface SerializedAnnotationProject {
  readonly version: 2;
  readonly testFileSuffix?: string;
  readonly containerLogs?: boolean;
  readonly environment?: Readonly<Record<string, ContainerEnvironmentReference>>;
}

/** Creates validated configuration for a built-in annotation project. */
export const serializeAnnotationProject = (
  testFileSuffix?: string,
  containerLogs?: boolean,
  environment?: Readonly<Record<string, ContainerEnvironmentReference>>,
): SerializedAnnotationProject => parseAnnotationProject({
  version: 2,
  testFileSuffix,
  containerLogs,
  environment,
});

/** Validates annotation configuration received from a test runner. */
export const parseAnnotationProject = (value: unknown): SerializedAnnotationProject => {
  if (!isRecord(value) || value.version !== 2) {
    throw new Error('Annotation project configuration is missing, invalid, or uses an unsupported version');
  }
  if (
    value.testFileSuffix !== undefined &&
    (typeof value.testFileSuffix !== 'string' || value.testFileSuffix.length === 0)
  ) {
    throw new Error('Annotation project testFileSuffix option is invalid');
  }
  if (value.containerLogs !== undefined && typeof value.containerLogs !== 'boolean') {
    throw new Error('Annotation project containerLogs option is invalid');
  }
  const environment = parseEnvironment(value.environment);
  return {
    version: 2,
    ...(value.testFileSuffix === undefined ? {} : { testFileSuffix: value.testFileSuffix }),
    ...(value.containerLogs === undefined ? {} : { containerLogs: value.containerLogs }),
    ...(environment === undefined ? {} : { environment }),
  };
};

const parseEnvironment = (
  value: unknown,
): Readonly<Record<string, ContainerEnvironmentReference>> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('Annotation project environment is invalid');
  return Object.fromEntries(Object.entries(value).map(([variable, candidate]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
      throw new Error(`Annotation project environment variable is invalid: ${variable}`);
    }
    if (
      !isRecord(candidate) ||
      candidate.source !== 'container' ||
      typeof candidate.container !== 'string' ||
      candidate.container.length === 0 ||
      typeof candidate.property !== 'string' ||
      candidate.property.length === 0
    ) {
      throw new Error(`Annotation project environment binding is invalid: ${variable}`);
    }
    return [variable, {
      source: 'container' as const,
      container: candidate.container,
      property: candidate.property,
    }];
  }));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
