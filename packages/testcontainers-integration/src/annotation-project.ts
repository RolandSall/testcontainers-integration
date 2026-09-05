/** Serializable annotation-discovery options transported through runner configuration. */
export interface SerializedAnnotationProject {
  readonly version: 1;
  readonly testFileSuffix?: string;
  readonly containerLogs?: boolean;
}

/** Creates validated configuration for a built-in annotation project. */
export const serializeAnnotationProject = (
  testFileSuffix?: string,
  containerLogs?: boolean,
): SerializedAnnotationProject => parseAnnotationProject({
  version: 1,
  testFileSuffix,
  containerLogs,
});

/** Validates annotation configuration received from a test runner. */
export const parseAnnotationProject = (
  value: unknown,
): SerializedAnnotationProject => {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Annotation project configuration is missing or invalid');
  }
  if (
    value.testFileSuffix !== undefined &&
    (typeof value.testFileSuffix !== 'string' || value.testFileSuffix.length === 0)
  ) {
    throw new Error('Annotation project testFileSuffix option is invalid');
  }
  if (
    value.containerLogs !== undefined &&
    typeof value.containerLogs !== 'boolean'
  ) {
    throw new Error('Annotation project containerLogs option is invalid');
  }
  return {
    version: 1,
    ...(value.testFileSuffix === undefined
      ? {}
      : { testFileSuffix: value.testFileSuffix }),
    ...(value.containerLogs === undefined
      ? {}
      : { containerLogs: value.containerLogs }),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
