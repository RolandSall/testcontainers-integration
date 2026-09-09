/** Controls whether one named container is reused across files or owned by one file. */
export type ContainerIsolation = 'shared' | 'dedicated';

/** Validates a per-container isolation value received from source or runner configuration. */
export const parseContainerIsolation = (value: unknown): ContainerIsolation => {
  if (value === 'shared' || value === 'dedicated') return value;
  throw new Error("Container isolation must be either 'shared' or 'dedicated'");
};
