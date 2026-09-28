/** Optional local dashboard configuration for generated Jest and Vitest projects. */
export interface IntegrationDashboardOptions {
  /** Opens the dashboard in the default browser. Defaults to false. */
  readonly open?: boolean;
  /** Directory, relative to the runner root, where reports are written. */
  readonly outputDirectory?: string;
}

/** Validated dashboard settings transported through runner configuration. */
export interface SerializedIntegrationDashboardOptions {
  readonly open: boolean;
  readonly outputDirectory: string;
}

export type IntegrationDashboardConfiguration =
  | boolean
  | IntegrationDashboardOptions;

const DEFAULT_OUTPUT_DIRECTORY = 'test-results/integration-testing';

/** Normalizes the public shorthand and rejects malformed configuration. */
export const serializeIntegrationDashboard = (
  value: IntegrationDashboardConfiguration | undefined,
): SerializedIntegrationDashboardOptions | undefined => {
  if (value === undefined || value === false) return undefined;
  if (value === true) {
    return { open: false, outputDirectory: DEFAULT_OUTPUT_DIRECTORY };
  }
  return parseIntegrationDashboard(value);
};

/** Validates dashboard settings received from serialized runner configuration. */
export const parseIntegrationDashboard = (
  value: unknown,
): SerializedIntegrationDashboardOptions | undefined => {
  if (value === undefined || value === false) return undefined;
  if (!isRecord(value)) {
    throw new Error('Integration dashboard configuration is invalid');
  }
  if (value.open !== undefined && typeof value.open !== 'boolean') {
    throw new Error('Integration dashboard open option is invalid');
  }
  if (
    value.outputDirectory !== undefined &&
    (typeof value.outputDirectory !== 'string' || value.outputDirectory.trim().length === 0)
  ) {
    throw new Error('Integration dashboard outputDirectory option is invalid');
  }
  if (value.outputDirectory !== undefined && !isSafeRelativeDirectory(value.outputDirectory)) {
    throw new Error('Integration dashboard outputDirectory must stay within the runner root');
  }
  const unknownOptions = Object.keys(value).filter(
    (key) => key !== 'open' && key !== 'outputDirectory',
  );
  if (unknownOptions.length > 0) {
    throw new Error(`Integration dashboard option is unknown: ${unknownOptions[0]}`);
  }
  return {
    open: value.open ?? false,
    outputDirectory: value.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY,
  };
};

const isSafeRelativeDirectory = (value: string): boolean => {
  if (isAbsolute(value)) return false;
  const normalized = normalize(value);
  const fromRoot = relative('.', normalized);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
import { isAbsolute, normalize, relative } from 'node:path';
