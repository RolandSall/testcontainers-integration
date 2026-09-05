/** Combines a primary lifecycle failure with every failure raised while cleaning it up. */
export const withCleanupFailures = (
  primaryFailure: unknown,
  cleanupFailures: readonly unknown[],
  message: string,
): unknown => {
  const flattenedCleanupFailures: unknown[] = [];
  for (const failure of cleanupFailures) {
    if (failure instanceof AggregateError) {
      const nestedFailures: unknown = failure.errors;
      if (Array.isArray(nestedFailures)) {
        flattenedCleanupFailures.push(...(nestedFailures as unknown[]));
        continue;
      }
    }
    flattenedCleanupFailures.push(failure);
  }
  if (flattenedCleanupFailures.length === 0) {
    return primaryFailure;
  }
  return new AggregateError(
    [primaryFailure, ...flattenedCleanupFailures],
    message,
    { cause: primaryFailure },
  );
};
