/** Constructor shape accepted by the application integration-test marker. */
export type ApplicationIntegrationTestClass = abstract new (
  ...arguments_: never[]
) => unknown;

const applicationIntegrationTests = new WeakSet<ApplicationIntegrationTestClass>();
const pendingApplicationIntegrationTests = new Set<ApplicationIntegrationTestClass>();

/** Marks one test file as requiring the configured application lifecycle. */
export const ApplicationIntegrationTest = <
  TClass extends ApplicationIntegrationTestClass,
>(target: TClass): TClass => {
  applicationIntegrationTests.add(target);
  pendingApplicationIntegrationTests.add(target);
  return target;
};

/** Reports whether a class was decorated with `@ApplicationIntegrationTest`. */
export const isApplicationIntegrationTest = (
  target: ApplicationIntegrationTestClass,
): boolean => applicationIntegrationTests.has(target);

/**
 * Returns and clears application markers evaluated since the previous runner hook cycle.
 * Runner adapters use this after the test module has been evaluated.
 */
export const consumeApplicationIntegrationTestClasses = (): readonly ApplicationIntegrationTestClass[] => {
  const testClasses = [...pendingApplicationIntegrationTests];
  pendingApplicationIntegrationTests.clear();
  return testClasses;
};

/**
 * Consumes the marker for one runner test file and rejects ambiguous declarations.
 *
 * An unannotated test file resolves to `undefined` so installed support remains inactive.
 */
export const consumeApplicationIntegrationTestClass = (): ApplicationIntegrationTestClass | undefined => {
  const testClasses = consumeApplicationIntegrationTestClasses();
  if (testClasses.length > 1) {
    throw new Error(
      `Expected one @ApplicationIntegrationTest class in the test file, found ${testClasses.length}`,
    );
  }
  return testClasses.at(0);
};
